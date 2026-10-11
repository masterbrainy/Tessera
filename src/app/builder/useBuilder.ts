import { useCallback, useEffect, useRef, useState } from "react";
import type { Dataset } from "../../engine/data";
import { loadDataset } from "../../workers/protocol";
import { DATA_URL } from "../useFederation";
import { generate, KIND_DEFAULTS, labelsFor, randomHotSteps, type ExchangeData, type GenSpec, type Quality } from "./generate";
import { emptySnap, runConsortium, type MemberInput, type Snapshot } from "./runConsortium";

export interface Exchange {
  id: string;
  name: string;
  kind: string;
  quality: Quality;
  data: ExchangeData | null;
}

export interface ExchangeStats {
  rows: number;
  labeled: number;
  /** Illicit share in the true labels (what the exchange's data really contains). */
  illicit: number;
}

export function statsOf(d: ExchangeData | null): ExchangeStats {
  if (!d) return { rows: 0, labeled: 0, illicit: 0 };
  let labeled = 0;
  let illicit = 0;
  for (const y of d.cleanLabels) {
    if (y >= 0) labeled++;
    if (y === 1) illicit++;
  }
  return { rows: d.rows, labeled, illicit };
}

const STARTERS: [string, string][] = [["Harbor", "Retail exchange"], ["Meridian", "Offshore exchange"], ["Kestrel", "OTC desk"]];
const NAMES = ["Harbor", "Meridian", "Kestrel", "Atlas", "Lumen", "Northgate", "Vela", "Corvid"];
export const MAX_EXCHANGES = 8;

let nextId = 1;
const newId = () => `ex${nextId++}`;

export function defaultSpec(kind: string, seed = Math.floor(Math.random() * 1e9)): GenSpec {
  const d = KIND_DEFAULTS[kind] ?? { size: 3000, illicitRate: 0.1 };
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return { ...d, hotSteps: randomHotSteps(rnd), seed };
}

export function useBuilder() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [snap, setSnap] = useState<Snapshot>(emptySnap);
  const [params, setParams] = useState<Float64Array | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const exRef = useRef(exchanges);
  exRef.current = exchanges;

  const takenBy = (list: Exchange[], except: string) =>
    new Set(list.filter((e) => e.id !== except).flatMap((e) => e.data?.rowsUsed ?? []));

  useEffect(() => {
    loadDataset(DATA_URL)
      .then((d) => {
        setDs(d);
        const list: Exchange[] = [];
        STARTERS.forEach(([name, kind], k) => {
          const id = newId();
          const data = generate(d, defaultSpec(kind, 1000 + k), takenBy(list, id));
          list.push({ id, name, kind, quality: "clean", data });
        });
        setExchanges(list);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  const add = useCallback((): string | null => {
    if (!ds || exRef.current.length >= MAX_EXCHANGES) return null;
    const used = new Set(exRef.current.map((e) => e.name));
    const name = NAMES.find((n) => !used.has(n)) ?? `Exchange ${exRef.current.length + 1}`;
    const kind = Object.keys(KIND_DEFAULTS)[exRef.current.length % 8];
    const id = newId();
    const data = generate(ds, defaultSpec(kind), takenBy(exRef.current, id));
    setExchanges((list) => [...list, { id, name, kind, quality: "clean", data }]);
    return id;
  }, [ds]);

  const update = useCallback((id: string, patch: Partial<Exchange>) => {
    setExchanges((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const regenerate = useCallback((id: string, spec: GenSpec) => {
    if (!ds) return;
    const data = generate(ds, spec, takenBy(exRef.current, id));
    setExchanges((list) => list.map((e) => (e.id === id ? { ...e, data } : e)));
  }, [ds]);

  const remove = useCallback((id: string) => setExchanges((list) => list.filter((e) => e.id !== id)), []);

  const run = useCallback(async (rounds: number) => {
    const ready = exRef.current.filter((e) => e.data);
    if (ready.length < 2) {
      setSnap((s) => ({ ...s, phase: "error", error: "Add at least two exchanges with data." }));
      return;
    }
    stopRef.current = false;
    setParams(null);
    const inputs: MemberInput[] = ready.map((e, k) => {
      const st = statsOf(e.data);
      return { id: e.id, name: e.name, kind: e.kind, n: st.labeled, illicit: st.illicit, bins: e.data!.bins, labels: labelsFor(e.data!, e.quality, k + 1) };
    });
    const final = await runConsortium(inputs, rounds, (p) => setSnap((s) => ({ ...s, ...p })), () => stopRef.current);
    if (final) setParams(final);
  }, []);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return { ds, loadError, exchanges, snap, params, add, update, regenerate, remove, run, stop };
}
