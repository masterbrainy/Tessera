import { useCallback, useEffect, useRef, useState } from "react";
import { EXCHANGES } from "../engine/data";
import { DEFAULT_CONFIG, summarize, type RoundResult, type RunConfig, type RunSummary, type Scores } from "../engine/federation";
import type { BaselineOut, CoordIn, CoordOut, LabIn, LabOut } from "../workers/protocol";

export const DATA_URL = new URL(`${import.meta.env.BASE_URL}data/elliptic.json`, window.location.href).href;
const MIN_ROUND_MS = 1100; // keep rounds slow enough to watch

export interface LabInfo {
  lab: number;
  name: string;
  kind: string;
  n: number;
  illicit: number;
}

/** A garden animation cue: the model going out to every exchange, or updates coming back. */
export interface GardenEvent {
  id: number;
  kind: "broadcast" | "updates";
  rejected: number[];
}

export interface FedState {
  status: "idle" | "loading" | "running" | "done" | "error";
  cfg: RunConfig;
  labs: LabInfo[];
  round: number;
  phase: "training" | "scoring" | null;
  rounds: RoundResult[];
  solo: Record<number, Scores[]>;
  pooled: Scores[];
  summary: RunSummary | null;
  event: GardenEvent | null;
  activity: { text: string; since: number } | null;
  startedAt: number | null;
  error: string | null;
}

const initial: FedState = {
  status: "idle",
  cfg: DEFAULT_CONFIG,
  labs: [],
  round: 0,
  phase: null,
  rounds: [],
  solo: {},
  pooled: [],
  summary: null,
  event: null,
  activity: null,
  startedAt: null,
  error: null,
};

function once<T extends { type: string }>(w: Worker, msg: unknown, accept: (m: T) => boolean, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<T>) => {
      if (e.data.type === "error") {
        cleanup();
        reject(new Error((e.data as unknown as { message: string }).message));
      } else if (accept(e.data)) {
        cleanup();
        resolve(e.data);
      }
    };
    const onErr = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(e.message || "worker crashed"));
    };
    const cleanup = () => {
      w.removeEventListener("message", onMsg as EventListener);
      w.removeEventListener("error", onErr);
    };
    w.addEventListener("message", onMsg as EventListener);
    w.addEventListener("error", onErr);
    w.postMessage(msg, transfer);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const names = (labs: number[]) => labs.map((l) => EXCHANGES[l].name).join(", ");

export function useFederation() {
  const [state, setState] = useState<FedState>(initial);
  const workers = useRef<Worker[]>([]);
  const runId = useRef(0);
  const eventId = useRef(0);

  const teardown = useCallback(() => {
    workers.current.forEach((w) => w.terminate());
    workers.current = [];
  }, []);
  useEffect(() => teardown, [teardown]);

  const patch = (id: number, fn: (s: FedState) => Partial<FedState>) =>
    setState((s) => (runId.current === id ? { ...s, ...fn(s) } : s));
  const activity = (text: string) => ({ activity: { text, since: Date.now() / 1000 } });

  const start = useCallback(
    async (cfg: RunConfig) => {
      teardown();
      const id = ++runId.current;
      setState({ ...initial, cfg, status: "loading", startedAt: Date.now(), ...activity("Starting one isolated worker per exchange and loading its private transactions…") });
      try {
        const labWorkers = Array.from({ length: cfg.numLabs }, () => new Worker(new URL("../workers/lab.worker.ts", import.meta.url), { type: "module" }));
        const coord = new Worker(new URL("../workers/coordinator.worker.ts", import.meta.url), { type: "module" });
        const baseline = new Worker(new URL("../workers/baseline.worker.ts", import.meta.url), { type: "module" });
        workers.current = [...labWorkers, coord, baseline];

        const ready = await Promise.all(
          labWorkers.map((w, lab) => once<LabOut>(w, { type: "init", cfg, lab, dataUrl: DATA_URL } satisfies LabIn, (m) => m.type === "ready")),
        );
        const c0 = await once<CoordOut>(coord, { type: "init", cfg, dataUrl: DATA_URL } satisfies CoordIn, (m) => m.type === "ready");
        if (c0.type !== "ready") return;
        const labs = ready.map((m) => {
          const r = m as Extract<LabOut, { type: "ready" }>;
          return { lab: r.lab, name: EXCHANGES[r.lab].name, kind: EXCHANGES[r.lab].kind, n: r.n, illicit: r.illicit };
        });

        baseline.onmessage = (e: MessageEvent<BaselineOut>) => {
          const m = e.data;
          if (m.type === "solo") patch(id, (s) => ({ solo: { ...s.solo, [m.lab]: [...(s.solo[m.lab] ?? []), m.scores] } }));
          else if (m.type === "pooled") patch(id, (s) => ({ pooled: [...s.pooled, m.scores] }));
        };
        baseline.postMessage({ type: "run", cfg, dataUrl: DATA_URL });

        patch(id, () => ({ status: "running", labs }));
        let global = c0.params;
        const rounds: RoundResult[] = [];
        for (let r = 0; r < cfg.rounds; r++) {
          if (runId.current !== id) return;
          const t0 = Date.now();
          patch(id, () => ({
            round: r,
            phase: "training",
            event: { id: ++eventId.current, kind: "broadcast", rejected: [] },
            ...activity(`Round ${r + 1}: the global model went out to all ${cfg.numLabs} exchanges. Each is training on its own customers' transactions.`),
          }));
          const updates = (
            await Promise.all(
              labWorkers.map((w) => once<LabOut>(w, { type: "update", round: r, global } satisfies LabIn, (m) => m.type === "update" && m.round === r)),
            )
          ).map((m) => {
            const u = m as Extract<LabOut, { type: "update" }>;
            return { lab: u.lab, n: u.n, rawNorm: u.rawNorm, clipped: u.clipped, delta: u.delta };
          });
          patch(id, () => ({
            phase: "scoring",
            ...activity(`Round ${r + 1}: ${updates.length} weight updates are back (no transactions). Screening them and pricing each exchange's contribution…`),
          }));
          const out = await once<CoordOut>(coord, { type: "coordinate", round: r, global, updates } satisfies CoordIn, (m) => m.type === "round");
          if (out.type !== "round") return;
          global = out.next;
          const elapsed = Date.now() - t0;
          if (elapsed < MIN_ROUND_MS) await sleep(MIN_ROUND_MS - elapsed);
          const result: RoundResult = { ...out.result, ms: elapsed };
          rounds.push(result);
          const rejected = result.labs.filter((l) => !l.accepted).map((l) => l.lab);
          patch(id, (s) => ({
            rounds: [...s.rounds, result],
            event: { id: ++eventId.current, kind: "updates", rejected },
            ...activity(
              rejected.length
                ? `Round ${r + 1}: rejected ${names(rejected)}'s update. It pointed away from everyone else's.`
                : `Round ${r + 1} merged. The model now catches ${(result.test.catchRate * 100).toFixed(1)}% of illicit transactions.`,
            ),
          }));
        }
        const summary = summarize(cfg.numLabs, rounds, global);
        labWorkers.forEach((w) => w.terminate());
        coord.terminate();
        patch(id, () => ({ status: "done", phase: null, summary, activity: null }));
      } catch (err) {
        teardown();
        patch(id, () => ({ status: "error", error: String(err), activity: null, phase: null }));
      }
    },
    [teardown],
  );

  const stop = useCallback(() => {
    runId.current++;
    teardown();
    setState((s) => ({ ...s, status: s.rounds.length ? "done" : "idle", phase: null, activity: null, summary: s.rounds.length ? s.summary : null }));
  }, [teardown]);

  return { state, start, stop };
}
