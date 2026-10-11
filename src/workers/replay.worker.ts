/// <reference lib="webworker" />
// Independent re-execution of a committed run from its config alone, for hash-by-hash verification.
import { inProcessClients, makeContext, runFederation } from "../engine/federation";
import { loadDataset, type ReplayIn, type ReplayOut } from "./protocol";

const post = (m: ReplayOut) => (self as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<ReplayIn>) => {
  try {
    const ctx = makeContext(e.data.cfg, await loadDataset(e.data.dataUrl));
    const summary = await runFederation(ctx, inProcessClients(ctx), { onRound: (result) => post({ type: "round", result }) });
    post({ type: "done", params: summary.params });
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
