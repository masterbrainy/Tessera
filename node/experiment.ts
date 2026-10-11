// Quick sweep used while tuning defaults: federated vs solo vs pooled, with and without defenses.
import { DEFAULT_CONFIG, baselineCurve, inProcessClients, makeContext, runFederation, type RunConfig } from "../src/engine/federation";
import { loadDataset } from "./load-dataset";

const ds = loadDataset();
const variant = JSON.parse(process.argv[2] ?? "{}") as Partial<RunConfig>;
const cfg: RunConfig = { ...DEFAULT_CONFIG, ...variant };
const ctx = makeContext(cfg, ds);
console.log("lab sizes", ctx.part.labs.map((l) => l.length), "val", ctx.part.val.length, "test", ctx.part.test.length);
const t0 = Date.now();
const summary = await runFederation(ctx, inProcessClients(ctx), {
  onRound: (r) =>
    console.log(`r${r.round} auc=${r.test.auc.toFixed(4)} catch=${r.test.catchRate.toFixed(3)} vloss=${r.valLoss.toFixed(4)} ${r.ms}ms`,
      r.labs.map((l) => `${l.flagged ? "!" : ""}${(l.shapley * 1000).toFixed(2)}/${l.cosine.toFixed(2)}`).join(" ")),
});
console.log("fed total", Date.now() - t0, "ms; payout bps", summary.payoutBps);
if (process.argv[3] === "baselines") {
  const fmt = (s: { auc: number; catchRate: number }) => `${s.auc.toFixed(4)}/${s.catchRate.toFixed(3)}`;
  const solo = ctx.part.labs.map((mols, i) => fmt(baselineCurve(ctx, mols, i).at(-1)!));
  const honest = ctx.part.labs.filter((_, i) => !cfg.attacks.some((a) => a.lab === i)).flat();
  console.log("solo", solo, "pooled", fmt(baselineCurve(ctx, honest, 99).at(-1)!));
}
