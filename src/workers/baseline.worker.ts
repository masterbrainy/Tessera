/// <reference lib="webworker" />
// Counterfactuals for the chart: each exchange training alone, and everyone pooling raw data.
import { baselineCurve, makeContext } from "../engine/federation";
import { loadDataset, type BaselineIn, type BaselineOut } from "./protocol";

const post = (m: BaselineOut) => (self as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<BaselineIn>) => {
  try {
    const ctx = makeContext(e.data.cfg, await loadDataset(e.data.dataUrl));
    const attackers = new Set(ctx.cfg.attacks.map((a) => a.lab));
    ctx.part.labs.forEach((mols, lab) => {
      if (attackers.has(lab)) return;
      baselineCurve(ctx, mols, lab, (round, scores) => post({ type: "solo", lab, round, scores }));
    });
    const honest = ctx.part.labs.filter((_, i) => !attackers.has(i)).flat();
    baselineCurve(ctx, honest, 99, (round, scores) => post({ type: "pooled", round, scores }));
    post({ type: "done" });
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
