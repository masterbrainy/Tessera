// Runs a consortium over the exchanges the user built. Each exchange's rows go into its own
// Web Worker and never come back out; the coordinator worker only ever sees weight deltas.
import { DEFAULT_CONFIG, payoutShares, type RunConfig } from "../../engine/federation";
import type { CoordIn, CoordOut } from "../../workers/protocol";
import type { ProviderIn, ProviderOut } from "../../workers/provider.worker";
import type { GardenEvent } from "../useFederation";
import { DATA_URL } from "../useFederation";
import { loadSchema } from "./csv";

export interface Member {
  id: string;
  name: string;
  kind: string;
  n: number;
  illicit: number;
}

export interface LiveRound {
  round: number;
  catchRate: number;
  auc: number;
  labs: { accepted: boolean; shapley: number; cosine: number; normRatio: number }[];
}

export interface Snapshot {
  phase: "idle" | "training" | "done" | "error";
  totalRounds: number;
  /** Members in lab order (frozen when training starts). */
  members: Member[];
  results: LiveRound[];
  /** Per member id: catch rate a model trained on its data alone reaches, per round. */
  solo: Record<string, number[]>;
  payoutBps: number[] | null;
  event: GardenEvent | null;
  status: string;
  error?: string;
}

export interface MemberInput extends Member {
  bins: Uint8Array;
  labels: Int8Array;
}

export const emptySnap: Snapshot = { phase: "idle", totalRounds: 12, members: [], results: [], solo: {}, payoutBps: null, event: null, status: "" };

const MIN_ROUND_MS = 1100; // slow enough to watch each round happen
const SCREEN_COS = 0.3; // a handful of members: be stricter about updates that disagree with the median

function workerCall<T extends { type: string }>(w: Worker, msg: unknown, accept: (m: T) => boolean, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<T>) => {
      if (e.data.type === "error") {
        w.removeEventListener("message", onMsg);
        reject(new Error((e.data as unknown as { message: string }).message));
      } else if (accept(e.data)) {
        w.removeEventListener("message", onMsg);
        resolve(e.data);
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage(msg, transfer);
  });
}

export async function runConsortium(
  inputs: MemberInput[],
  totalRounds: number,
  publish: (s: Partial<Snapshot>) => void,
  shouldStop: () => boolean,
): Promise<Float64Array | null> {
  const members: Member[] = inputs.map(({ id, name, kind, n, illicit }) => ({ id, name, kind, n, illicit }));
  const cfg: RunConfig = { ...DEFAULT_CONFIG, numLabs: members.length, rounds: totalRounds, attacks: [], screenCos: SCREEN_COS };
  publish({ phase: "training", totalRounds, members, results: [], solo: {}, payoutBps: null, event: null, error: undefined, status: "Loading each exchange's data into its own private worker…" });

  const coord = new Worker(new URL("../../workers/coordinator.worker.ts", import.meta.url), { type: "module" });
  const labs = inputs.map(() => new Worker(new URL("../../workers/provider.worker.ts", import.meta.url), { type: "module" }));
  try {
    const schema = await loadSchema();
    const c0 = await workerCall<CoordOut>(coord, { type: "init", cfg, dataUrl: DATA_URL } satisfies CoordIn, (m) => m.type === "ready");
    if (c0.type !== "ready") throw new Error("coordinator failed to start");
    await Promise.all(inputs.map((m, lab) => {
      const msg: ProviderIn = { type: "init", cfg, lab, dataUrl: DATA_URL, bins: m.bins.slice(), labels: m.labels.slice(), features: schema.features, nBins: schema.nBins };
      return workerCall<ProviderOut>(labs[lab], msg, (x) => x.type === "ready", [msg.bins.buffer, msg.labels.buffer]);
    }));

    let global = c0.params;
    const results: LiveRound[] = [];
    const solo: Record<string, number[]> = {};
    let eventId = 0;
    for (let r = 0; r < totalRounds; r++) {
      if (shouldStop()) break;
      const t0 = Date.now();
      publish({ event: { id: ++eventId, kind: "broadcast", rejected: [] }, status: `Round ${r + 1} of ${totalRounds}: each exchange trains the shared model on its own transactions` });
      const updates = await Promise.all(labs.map(async (w) => {
        const g = global.slice();
        const out = await workerCall<ProviderOut>(w, { type: "update", round: r, global: g } satisfies ProviderIn, (m) => m.type === "update", [g.buffer]);
        if (out.type !== "update") throw new Error("unexpected reply");
        return out;
      }));
      const wire = updates.map((u, lab) => ({ lab, n: u.n, rawNorm: u.rawNorm, clipped: false, delta: u.delta }));
      const out = await workerCall<CoordOut>(coord, { type: "coordinate", round: r, global, updates: wire } satisfies CoordIn, (m) => m.type === "round");
      if (out.type !== "round") throw new Error("coordinator failed");
      global = out.next;
      results.push({
        round: r,
        catchRate: out.result.test.catchRate,
        auc: out.result.test.auc,
        labs: out.result.labs.map((l) => ({ accepted: l.accepted, shapley: l.shapley, cosine: l.cosine, normRatio: l.normRatio })),
      });
      updates.forEach((u, lab) => (solo[members[lab].id] = [...(solo[members[lab].id] ?? []), u.solo.catchRate]));
      const rejected = out.result.labs.filter((l) => !l.accepted).map((l) => l.lab);
      const wait = MIN_ROUND_MS - (Date.now() - t0);
      if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
      publish({
        results: [...results],
        solo: { ...solo },
        event: { id: ++eventId, kind: "updates", rejected },
        status: rejected.length
          ? `Round ${r + 1}: ${rejected.map((l) => members[l].name).join(", ")} rejected. Its update pulls against everyone else's`
          : `Round ${r + 1}: all ${members.length} updates accepted and priced`,
      });
    }
    const contribution = members.map((_, lab) => results.reduce((a, x) => a + x.labs[lab].shapley, 0));
    publish({ phase: "done", payoutBps: payoutShares(contribution), status: "Run complete. The pool is split by contribution." });
    return global;
  } catch (err) {
    publish({ phase: "error", error: String(err), status: "Run failed." });
    return null;
  } finally {
    coord.terminate();
    labs.forEach((w) => w.terminate());
  }
}
