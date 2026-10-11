/// <reference lib="webworker" />
// A live room member's private data. Its rows never leave this worker: it trains on them and
// posts back only the weight delta, plus how a model trained on its data alone would score.
import { evaluate, labUpdate, makeContext, initialParams, type Context, type RunConfig } from "../engine/federation";
import { train } from "../engine/model";
import { Rng, seedFrom } from "../engine/rng";
import { datasetFromBins, type Dataset } from "../engine/data";
import { loadDataset } from "./protocol";

export type ProviderIn =
  | { type: "init"; cfg: RunConfig; lab: number; dataUrl: string; bins: Uint8Array; labels: Int8Array; features: string[]; nBins: number }
  | { type: "update"; round: number; global: Float64Array };
export type ProviderOut =
  | { type: "ready" }
  | { type: "update"; round: number; n: number; rawNorm: number; delta: Float64Array; solo: { auc: number; catchRate: number } }
  | { type: "error"; message: string };

let cfg: RunConfig | null = null;
let lab = 0;
let mine: Dataset | null = null;
let idx: number[] = [];
let pub: Context | null = null;
let solo: Float64Array | null = null;
const post = (m: ProviderOut, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<ProviderIn>) => {
  try {
    const msg = e.data;
    if (msg.type === "init") {
      cfg = msg.cfg;
      lab = msg.lab;
      mine = datasetFromBins(msg.bins, msg.labels, msg.features, msg.nBins);
      idx = [];
      for (let i = 0; i < mine.size; i++) if (mine.labels[i] >= 0) idx.push(i);
      // The public benchmark window, only to show this member what it would reach alone.
      pub = makeContext({ ...cfg, numLabs: 2 }, await loadDataset(msg.dataUrl));
      solo = initialParams(cfg, pub.ds);
      post({ type: "ready" });
      return;
    }
    if (!cfg || !mine || !pub || !solo) throw new Error("provider not initialised");
    const u = labUpdate({ ...cfg, attacks: [] }, mine, idx, lab, msg.round, msg.global);
    solo = train(solo, pub.shape, mine, idx, { epochs: cfg.localEpochs, lr: cfg.lr, batchSize: cfg.batchSize }, new Rng(seedFrom(cfg.seed, 3, lab, msg.round)));
    const s = evaluate(pub, solo, pub.part.test);
    post({ type: "update", round: msg.round, n: u.n, rawNorm: u.rawNorm, delta: u.delta, solo: { auc: s.auc, catchRate: s.catchRate } }, [u.delta.buffer]);
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
