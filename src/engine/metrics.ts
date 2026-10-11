import type { Dataset } from "./data";
import { detLog } from "./detmath";

/** ROC-AUC via the rank-sum statistic, ties get averaged ranks. */
export function rocAuc(scores: number[], ys: number[]): number {
  const n = scores.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[a] - scores[b] || a - b);
  let pos = 0;
  let rankSumPos = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scores[order[j + 1]] === scores[order[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      if (ys[order[k]] === 1) {
        pos++;
        rankSumPos += avgRank;
      }
    }
    i = j + 1;
  }
  const neg = n - pos;
  if (pos === 0 || neg === 0) return NaN;
  return (rankSumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** Mean ROC-AUC over assays that have both classes in `idx`. */
export function meanAuc(probs: Float64Array, ds: Dataset, idx: readonly number[]): number {
  const T = ds.tasks.length;
  let sum = 0;
  let count = 0;
  for (let t = 0; t < T; t++) {
    const s: number[] = [];
    const y: number[] = [];
    idx.forEach((m, r) => {
      const label = ds.labels[m * T + t];
      if (label >= 0) {
        s.push(probs[r * T + t]);
        y.push(label);
      }
    });
    const auc = rocAuc(s, y);
    if (!Number.isNaN(auc)) {
      sum += auc;
      count++;
    }
  }
  return count ? sum / count : NaN;
}

export function perTaskAuc(probs: Float64Array, ds: Dataset, idx: readonly number[]): number[] {
  const T = ds.tasks.length;
  return ds.tasks.map((_, t) => {
    const s: number[] = [];
    const y: number[] = [];
    idx.forEach((m, r) => {
      const label = ds.labels[m * T + t];
      if (label >= 0) {
        s.push(probs[r * T + t]);
        y.push(label);
      }
    });
    return rocAuc(s, y);
  });
}

/** Mean binary cross-entropy over labeled entries. Deterministic (detLog), used for contribution scoring. */
export function logLoss(probs: Float64Array, ds: Dataset, idx: readonly number[]): number {
  const T = ds.tasks.length;
  let sum = 0;
  let count = 0;
  idx.forEach((m, r) => {
    for (let t = 0; t < T; t++) {
      const y = ds.labels[m * T + t];
      if (y < 0) continue;
      const p = Math.min(1 - 1e-7, Math.max(1e-7, probs[r * T + t]));
      sum -= y === 1 ? detLog(p) : detLog(1 - p);
      count++;
    }
  });
  return count ? sum / count : 0;
}

/** Share of illicit transactions flagged when the alert threshold allows `fpr` of licit ones through as false alarms. */
export function recallAtFpr(probs: Float64Array, ds: Dataset, idx: readonly number[], fpr = 0.01): number {
  const T = ds.tasks.length;
  const neg: number[] = [];
  const pos: number[] = [];
  idx.forEach((m, r) => {
    const y = ds.labels[m * T];
    if (y === 1) pos.push(probs[r * T]);
    else if (y === 0) neg.push(probs[r * T]);
  });
  if (!pos.length || !neg.length) return NaN;
  neg.sort((a, b) => b - a);
  const threshold = neg[Math.min(neg.length - 1, Math.floor(fpr * neg.length))];
  return pos.filter((s) => s > threshold).length / pos.length;
}
