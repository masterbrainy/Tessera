export type Aggregator = "fedavg" | "trimmed" | "median";

export interface Update {
  delta: Float64Array;
  /** Number of training molecules (FedAvg weight). */
  n: number;
}

/** Combine updates. Order of `updates` must be deterministic (lab order). */
export function aggregate(updates: readonly Update[], method: Aggregator, trimFrac: number): Float64Array {
  const dim = updates[0].delta.length;
  const out = new Float64Array(dim);
  const k = updates.length;
  if (method === "fedavg" || k <= 2) {
    const total = updates.reduce((a, u) => a + u.n, 0);
    for (const u of updates) {
      const w = u.n / total;
      for (let i = 0; i < dim; i++) out[i] += w * u.delta[i];
    }
    return out;
  }
  const col = new Float64Array(k);
  const trim = method === "median" ? 0 : Math.min(Math.floor(trimFrac * k), Math.floor((k - 1) / 2));
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < k; j++) col[j] = updates[j].delta[i];
    col.sort();
    if (method === "median") {
      out[i] = k % 2 ? col[(k - 1) / 2] : (col[k / 2 - 1] + col[k / 2]) / 2;
    } else {
      let s = 0;
      for (let j = trim; j < k - trim; j++) s += col[j];
      out[i] = s / (k - 2 * trim);
    }
  }
  return out;
}

export function norm(v: Float64Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot / d;
}

export interface Screening {
  cosine: number;
  normRatio: number;
  flagged: boolean;
}

/**
 * Score each update against the coordinate-wise median of all updates (a reference
 * an attacker minority cannot drag). Updates pointing away from it, or far larger
 * than the typical update, are flagged.
 */
export function screen(updates: readonly Update[], cosThreshold = 0.1, normLimit = 3): Screening[] {
  const ref = aggregate(updates, "median", 0);
  const norms = updates.map((u) => norm(u.delta));
  const sortedNorms = Float64Array.from(norms).sort();
  const medNorm = sortedNorms[Math.floor((sortedNorms.length - 1) / 2)] || 1;
  return updates.map((u, i) => {
    const c = cosine(u.delta, ref);
    const r = norms[i] / medNorm;
    return { cosine: c, normRatio: r, flagged: c < cosThreshold || r > normLimit };
  });
}
