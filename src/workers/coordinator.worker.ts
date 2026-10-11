/// <reference lib="webworker" />
// The coordinator: screens updates, aggregates, scores contributions. Never sees a transaction.
import { coordinate, initialParams, makeContext, type Context } from "../engine/federation";
import { loadDataset, type CoordIn, type CoordOut } from "./protocol";

let ctx: Context | null = null;
const post = (m: CoordOut, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<CoordIn>) => {
  try {
    const msg = e.data;
    if (msg.type === "init") {
      ctx = makeContext(msg.cfg, await loadDataset(msg.dataUrl));
      const params = initialParams(ctx.cfg, ctx.ds);
      post({ type: "ready", params, valSize: ctx.part.val.length, testSize: ctx.part.test.length });
      return;
    }
    if (!ctx) throw new Error("coordinator not initialised");
    const { next, result } = coordinate(ctx, msg.round, msg.global, msg.updates);
    post({ type: "round", result, next });
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
