// Generates an exchange's private transaction history from a few business parameters.
// Rows are real labeled Bitcoin transactions (Elliptic, time steps 1-30) drawn to match the
// profile: how many transactions, how much illicit flow reaches the venue, and which scam
// waves cash out there. Exchanges never share rows, just like real venues.
import type { Dataset } from "../../engine/data";
import { Rng } from "../../engine/rng";

export type Quality = "clean" | "noisy" | "compromised";

export interface GenSpec {
  size: number;
  /** Share of transactions that are illicit, 0..1. */
  illicitRate: number;
  /** Time steps (two-week windows, 1..30) whose scam waves concentrate at this venue. */
  hotSteps: number[];
  seed: number;
}

export interface ExchangeData {
  source: "generated" | "uploaded";
  fileName?: string;
  spec?: GenSpec;
  /** Row indices in the public dataset (generated exchanges only), so others can't reuse them. */
  rowsUsed?: number[];
  bins: Uint8Array;
  /** Ground-truth labels as provided (1 illicit, 0 licit, -1 unlabeled). */
  cleanLabels: Int8Array;
  txIds: string[];
  steps: Uint8Array | null;
  rows: number;
}

export const KINDS = ["Retail exchange", "Offshore exchange", "OTC desk", "Regulated custodian", "Payments app", "Neobank", "DeFi on-ramp", "Crypto ATM network"];

/** Suggested starting parameters per kind of venue. */
export const KIND_DEFAULTS: Record<string, { size: number; illicitRate: number }> = {
  "Retail exchange": { size: 5000, illicitRate: 0.11 },
  "Offshore exchange": { size: 3500, illicitRate: 0.22 },
  "OTC desk": { size: 2000, illicitRate: 0.15 },
  "Regulated custodian": { size: 6000, illicitRate: 0.04 },
  "Payments app": { size: 4000, illicitRate: 0.09 },
  Neobank: { size: 4500, illicitRate: 0.06 },
  "DeFi on-ramp": { size: 2500, illicitRate: 0.18 },
  "Crypto ATM network": { size: 1500, illicitRate: 0.25 },
};

export const TRAIN_STEPS = 30;
const HOT_WEIGHT = 8;

function binsOf(ds: Dataset, idx: number[]): Uint8Array {
  const F = ds.features.length;
  const out = new Uint8Array(idx.length * F);
  idx.forEach((row, r) => {
    const fp = ds.fp[row];
    for (let f = 0; f < F; f++) out[r * F + f] = fp[f] - f * ds.nBins;
  });
  return out;
}

/** Weighted sample without replacement (Efraimidis-Spirakis keys). */
function weightedSample(pool: number[], weight: (i: number) => number, k: number, rng: Rng): number[] {
  return pool
    .map((i) => ({ i, key: -Math.log(1 - rng.next()) / weight(i) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, k)
    .map((x) => x.i);
}

export function generate(ds: Dataset, spec: GenSpec, taken: ReadonlySet<number>): ExchangeData {
  const rng = new Rng(spec.seed);
  const illicit: number[] = [];
  const licit: number[] = [];
  for (let i = 0; i < ds.size; i++) {
    if (ds.split[i] !== 0 || taken.has(i)) continue;
    (ds.labels[i] === 1 ? illicit : licit).push(i);
  }
  const hot = new Set(spec.hotSteps);
  const nIllicit = Math.min(illicit.length, Math.round(spec.size * spec.illicitRate));
  const nLicit = Math.min(licit.length, spec.size - nIllicit);
  const pick = [
    ...weightedSample(illicit, (i) => (hot.has(ds.step[i]) ? HOT_WEIGHT : 1), nIllicit, rng),
    ...weightedSample(licit, () => 1, nLicit, rng),
  ];
  const rows = rng.shuffle(pick);
  return {
    source: "generated",
    spec,
    rowsUsed: rows,
    bins: binsOf(ds, rows),
    cleanLabels: Int8Array.from(rows, (i) => ds.labels[i]),
    txIds: rows.map((i) => String(ds.txId[i])),
    steps: Uint8Array.from(rows, (i) => ds.step[i]),
    rows: rows.length,
  };
}

/** Labels as the exchange actually holds them, after any data-quality problem. */
export function labelsFor(d: ExchangeData, quality: Quality, seed: number): Int8Array {
  if (quality === "clean") return d.cleanLabels;
  if (quality === "compromised") return d.cleanLabels.map((y) => (y < 0 ? y : 1 - y)) as Int8Array;
  const rng = new Rng(seed ^ 0x5eed);
  return d.cleanLabels.map((y) => (y >= 0 && rng.next() < 0.3 ? 1 - y : y)) as Int8Array;
}

export function randomHotSteps(rng: () => number, count = 3): number[] {
  const s = new Set<number>();
  while (s.size < count) s.add(1 + Math.floor(rng() * TRAIN_STEPS));
  return [...s].sort((a, b) => a - b);
}
