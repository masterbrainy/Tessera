import { Rng } from "./rng";

export interface Dataset {
  name: string;
  tasks: string[];
  features: string[];
  nBins: number;
  nBits: number;
  /** Active input bit per feature (feature * nBins + bin), per transaction. */
  fp: Uint16Array[];
  /** Row-major [row][task]: 1 illicit, 0 licit, -1 unknown. */
  labels: Int8Array;
  /** 0 = held by exchanges, 1 = consortium validation window, 2 = future test window. */
  split: Uint8Array;
  step: Uint8Array;
  txId: Uint32Array;
  size: number;
}

export interface RawDataset {
  name: string;
  tasks: string[];
  features: string[];
  nBins: number;
  /** Quantile bin edges per feature, so raw values from an uploaded CSV bin the same way. */
  edges?: number[][];
  rows: number;
  bins: string;
  labels: string;
  step: string;
  split: string;
  txId: string;
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function parseDataset(raw: RawDataset): Dataset {
  const F = raw.features.length;
  const bins = fromBase64(raw.bins);
  const fp = Array.from({ length: raw.rows }, (_, r) => {
    const bits = new Uint16Array(F);
    for (let f = 0; f < F; f++) bits[f] = f * raw.nBins + bins[r * F + f];
    return bits;
  });
  const txBytes = fromBase64(raw.txId);
  return {
    name: raw.name,
    tasks: raw.tasks,
    features: raw.features,
    nBins: raw.nBins,
    nBits: F * raw.nBins,
    fp,
    labels: new Int8Array(fromBase64(raw.labels).buffer),
    split: fromBase64(raw.split),
    step: fromBase64(raw.step),
    txId: new Uint32Array(txBytes.buffer, txBytes.byteOffset, raw.rows),
    size: raw.rows,
  };
}

/** A member's private rows (uint8 bin per feature, row-major) as a Dataset the model can train on. */
export function datasetFromBins(bins: Uint8Array, labels: Int8Array, features: string[], nBins: number): Dataset {
  const F = features.length;
  const rows = labels.length;
  const fp = Array.from({ length: rows }, (_, r) => {
    const bits = new Uint16Array(F);
    for (let f = 0; f < F; f++) bits[f] = f * nBins + bins[r * F + f];
    return bits;
  });
  return {
    name: "private",
    tasks: ["illicit"],
    features,
    nBins,
    nBits: F * nBins,
    fp,
    labels,
    split: new Uint8Array(rows),
    step: new Uint8Array(rows),
    txId: new Uint32Array(rows),
    size: rows,
  };
}

export interface Partition {
  /** Transactions each exchange holds privately. */
  labs: number[][];
  /** Consortium-held validation window, used only for contribution scoring. */
  val: number[];
  /** Later time steps nobody trains on; this is what the reported AUC measures. */
  test: number[];
}

/**
 * Exchanges differ in size and in how much illicit flow reaches them (an offshore
 * venue sees far more scam deposits than a regulated custodian). Both skews make
 * the split non-IID, which is what makes contribution scoring meaningful.
 */
export interface ExchangeProfile {
  name: string;
  kind: string;
  size: number;
  illicitBias: number;
}

export const EXCHANGES: ExchangeProfile[] = [
  { name: "Harbor", kind: "Retail exchange", size: 1.6, illicitBias: 1.0 },
  { name: "Meridian", kind: "Offshore exchange", size: 1.0, illicitBias: 2.6 },
  { name: "Kestrel", kind: "OTC desk", size: 0.7, illicitBias: 1.4 },
  { name: "Atlas", kind: "Regulated custodian", size: 2.2, illicitBias: 0.35 },
  { name: "Lumen", kind: "Payments app", size: 1.2, illicitBias: 0.8 },
  { name: "Northgate", kind: "Neobank", size: 1.4, illicitBias: 0.6 },
  { name: "Vela", kind: "DeFi on-ramp", size: 0.8, illicitBias: 1.8 },
  { name: "Corvid", kind: "Crypto ATM network", size: 0.6, illicitBias: 2.2 },
];

const WAVE_CONCENTRATION = 8;

export function partition(ds: Dataset, numLabs: number, seed: number): Partition {
  const pool: number[] = [];
  const val: number[] = [];
  const test: number[] = [];
  for (let i = 0; i < ds.size; i++) {
    if (ds.split[i] === 0) pool.push(i);
    else if (ds.split[i] === 1) val.push(i);
    else test.push(i);
  }
  const profiles = EXCHANGES.slice(0, numLabs);
  const T = ds.tasks.length;
  const rng = new Rng(seed);
  const labs: number[][] = profiles.map(() => []);
  for (const i of rng.shuffle(pool)) {
    const illicit = ds.labels[i * T] === 1;
    // Each scam wave (time step) cashes out mostly through one venue, so no single
    // exchange sees every laundering pattern. That's the bottleneck pooling fixes.
    const hotspot = ds.step[i] % numLabs;
    const w = profiles.map((p, l) =>
      illicit ? p.size * p.illicitBias * (l === hotspot ? WAVE_CONCENTRATION : 1) : p.size,
    );
    let x = rng.next() * w.reduce((a, b) => a + b, 0);
    let lab = 0;
    while (lab < w.length - 1 && x >= w[lab]) x -= w[lab++];
    labs[lab].push(i);
  }
  return { labs, val, test };
}
