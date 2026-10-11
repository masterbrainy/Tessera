import type { Dataset } from "./data";
import { sigmoid } from "./detmath";
import { Rng } from "./rng";

/**
 * Multi-task MLP: fingerprint bits -> ReLU hidden layer -> one sigmoid per assay.
 * Parameters live in one flat Float64Array so updates can be averaged, clipped,
 * hashed and shipped between labs as a single vector.
 * Inputs are sparse (~45 of 1024 bits set), so layer 1 only touches active rows.
 */
export interface Shape {
  nBits: number;
  hidden: number;
  tasks: number;
}

export function paramCount({ nBits, hidden, tasks }: Shape): number {
  return nBits * hidden + hidden + hidden * tasks + tasks;
}

function offsets({ nBits, hidden, tasks }: Shape) {
  const w1 = 0;
  const b1 = nBits * hidden;
  const w2 = b1 + hidden;
  const b2 = w2 + hidden * tasks;
  return { w1, b1, w2, b2 };
}

export function initParams(shape: Shape, rng: Rng): Float64Array {
  const p = new Float64Array(paramCount(shape));
  const o = offsets(shape);
  // He init scaled by the number of active inputs (one per feature), not nBits.
  const s1 = Math.sqrt(2 / (shape.nBits / 8));
  for (let i = o.w1; i < o.b1; i++) p[i] = rng.gaussian() * s1;
  const s2 = Math.sqrt(1 / shape.hidden);
  for (let i = o.w2; i < o.b2; i++) p[i] = rng.gaussian() * s2;
  for (let i = o.b2; i < p.length; i++) p[i] = -2; // ~10% of labeled transactions are illicit
  return p;
}

function hiddenActivations(p: Float64Array, shape: Shape, bits: Uint16Array, h: Float64Array) {
  const { hidden } = shape;
  const o = offsets(shape);
  for (let j = 0; j < hidden; j++) h[j] = p[o.b1 + j];
  for (let k = 0; k < bits.length; k++) {
    const row = o.w1 + bits[k] * hidden;
    for (let j = 0; j < hidden; j++) h[j] += p[row + j];
  }
  for (let j = 0; j < hidden; j++) if (h[j] < 0) h[j] = 0;
}

/** Predicted probability per task for each molecule, row-major [i][task]. */
export function predict(p: Float64Array, shape: Shape, ds: Dataset, idx: readonly number[]): Float64Array {
  const { hidden, tasks } = shape;
  const o = offsets(shape);
  const h = new Float64Array(hidden);
  const out = new Float64Array(idx.length * tasks);
  idx.forEach((m, r) => {
    hiddenActivations(p, shape, ds.fp[m], h);
    for (let t = 0; t < tasks; t++) {
      let z = p[o.b2 + t];
      for (let j = 0; j < hidden; j++) z += h[j] * p[o.w2 + j * tasks + t];
      out[r * tasks + t] = sigmoid(z);
    }
  });
  return out;
}

export function predictBits(p: Float64Array, shape: Shape, bits: Uint16Array): number[] {
  const fake = { fp: [bits] } as unknown as Dataset;
  return Array.from(predict(p, shape, fake, [0]));
}

export interface TrainOptions {
  epochs: number;
  lr: number;
  batchSize: number;
  /** Train on inverted labels (a data-poisoning attacker). */
  flipLabels?: boolean;
}

/** Local training with Adam (fresh optimizer state each round, as in FedAvg). Returns new params. */
export function train(
  start: Float64Array,
  shape: Shape,
  ds: Dataset,
  idx: readonly number[],
  opts: TrainOptions,
  rng: Rng,
): Float64Array {
  const { hidden, tasks } = shape;
  const o = offsets(shape);
  const p = Float64Array.from(start);
  const n = p.length;
  const g = new Float64Array(n);
  const m = new Float64Array(n);
  const v = new Float64Array(n);
  const h = new Float64Array(hidden);
  const dh = new Float64Array(hidden);
  const gOut = new Float64Array(tasks);
  const b1 = 0.9;
  const b2 = 0.999;
  // Running powers instead of Math.pow, which is not bit-exact across engines.
  let pb1 = 1;
  let pb2 = 1;

  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    const order = rng.shuffle(idx);
    for (let start = 0; start < order.length; start += opts.batchSize) {
      const batch = order.slice(start, start + opts.batchSize);
      g.fill(0);
      let labeled = 0;
      for (const mi of batch) for (let t = 0; t < tasks; t++) if (ds.labels[mi * tasks + t] >= 0) labeled++;
      if (labeled === 0) continue;
      const scale = 1 / labeled;

      for (const mi of batch) {
        const bits = ds.fp[mi];
        hiddenActivations(p, shape, bits, h);
        for (let t = 0; t < tasks; t++) {
          let y = ds.labels[mi * tasks + t];
          if (y < 0) {
            gOut[t] = 0;
            continue;
          }
          if (opts.flipLabels) y = 1 - y;
          let z = p[o.b2 + t];
          for (let j = 0; j < hidden; j++) z += h[j] * p[o.w2 + j * tasks + t];
          gOut[t] = (sigmoid(z) - y) * scale; // d(BCE)/dz
          g[o.b2 + t] += gOut[t];
        }
        for (let j = 0; j < hidden; j++) {
          let acc = 0;
          for (let t = 0; t < tasks; t++) {
            g[o.w2 + j * tasks + t] += h[j] * gOut[t];
            acc += p[o.w2 + j * tasks + t] * gOut[t];
          }
          dh[j] = h[j] > 0 ? acc : 0;
          g[o.b1 + j] += dh[j];
        }
        for (let k = 0; k < bits.length; k++) {
          const row = o.w1 + bits[k] * hidden;
          for (let j = 0; j < hidden; j++) g[row + j] += dh[j];
        }
      }

      // Adam. Layer-1 rows for bits absent from the batch have zero gradient;
      // we still decay their moments so the update is exactly standard Adam.
      pb1 *= b1;
      pb2 *= b2;
      const c1 = 1 - pb1;
      const c2 = 1 - pb2;
      for (let i = 0; i < n; i++) {
        const gi = g[i];
        m[i] = b1 * m[i] + (1 - b1) * gi;
        v[i] = b2 * v[i] + (1 - b2) * gi * gi;
        if (m[i] !== 0) p[i] -= (opts.lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + 1e-8);
      }
    }
  }
  return p;
}
