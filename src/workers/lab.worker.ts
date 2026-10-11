/// <reference lib="webworker" />
// One exchange. It holds only its own transactions and only ever posts weight deltas back.
import { labUpdate, makeContext, type Context } from "../engine/federation";
import { loadDataset, type LabIn, type LabOut } from "./protocol";

let ctx: Context | null = null;
let lab = 0;
const post = (m: LabOut, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<LabIn>) => {
  try {
    const msg = e.data;
    if (msg.type === "init") {
      ctx = makeContext(msg.cfg, await loadDataset(msg.dataUrl));
      lab = msg.lab;
      const mine = ctx.part.labs[lab];
      const illicit = mine.filter((i) => ctx!.ds.labels[i] === 1).length;
      post({ type: "ready", lab, n: mine.length, illicit });
      return;
    }
    if (!ctx) throw new Error("lab worker not initialised");
    const u = labUpdate(ctx.cfg, ctx.ds, ctx.part.labs[lab], lab, msg.round, msg.global);
    post({ type: "update", lab, round: msg.round, n: u.n, rawNorm: u.rawNorm, clipped: u.clipped, delta: u.delta }, [u.delta.buffer]);
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
