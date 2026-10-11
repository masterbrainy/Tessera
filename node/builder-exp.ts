// Tuning harness for the data-market builder: generated exchanges, consortium vs each alone.
import { DEFAULT_CONFIG, coordinate, evaluate, initialParams, labUpdate, makeContext, payoutShares, type RunConfig } from "../src/engine/federation";
import { train } from "../src/engine/model";
import { Rng, seedFrom } from "../src/engine/rng";
import { datasetFromBins } from "../src/engine/data";
import { generate, labelsFor, type Quality } from "../src/app/builder/generate";
import { loadDataset } from "./load-dataset";

const ds = loadDataset();
const opts = JSON.parse(process.argv[2] ?? "{}");
const specs: { size: number; illicitRate: number; hotSteps: number[]; q: Quality }[] = opts.specs;
const taken = new Set<number>();
const members = specs.map((s, k) => {
  const d = generate(ds, { ...s, seed: 1000 + k }, taken);
  d.rowsUsed!.forEach((i) => taken.add(i));
  const labels = labelsFor(d, s.q, k + 1);
  const priv = datasetFromBins(d.bins, labels, ds.features, ds.nBins);
  return { priv, idx: [...priv.labels.keys()] };
});
const cfg: RunConfig = { ...DEFAULT_CONFIG, numLabs: specs.length, rounds: opts.rounds ?? 8, attacks: [], screenCos: opts.cos ?? 0.3, ...(opts.cfg ?? {}) };
const ctx = makeContext(cfg, ds);
let g = initialParams(cfg, ds);
const contrib = specs.map(() => 0);
const solo = members.map(() => initialParams(cfg, ds));
for (let r = 0; r < cfg.rounds; r++) {
  const ups = members.map((m, lab) => labUpdate(cfg, m.priv, m.idx, lab, r, g));
  const { next, result } = coordinate(ctx, r, g, ups);
  g = next;
  members.forEach((m, lab) => (solo[lab] = train(solo[lab], ctx.shape, m.priv, m.idx, { epochs: 1, lr: cfg.lr, batchSize: cfg.batchSize }, new Rng(seedFrom(cfg.seed, 3, lab, r)))));
  result.labs.forEach((l) => (contrib[l.lab] += l.shapley));
  console.log(`r${r} fed=${result.test.catchRate.toFixed(3)}`, result.labs.map((l) => `${l.accepted ? "" : "X"}${(l.shapley * 1000).toFixed(1)}/${l.cosine.toFixed(2)}`).join(" "));
}
console.log("solo", members.map((_, lab) => evaluate(ctx, solo[lab], ctx.part.test).catchRate.toFixed(3)).join(" "), "payout", payoutShares(contrib));
