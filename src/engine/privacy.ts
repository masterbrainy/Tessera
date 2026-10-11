import { norm } from "./aggregate";
import type { Rng } from "./rng";

export interface DpConfig {
  enabled: boolean;
  /** L2 clipping bound C on each lab's update. */
  clip: number;
  /** Gaussian noise std = noiseMultiplier * C, added by the lab before sending. */
  noiseMultiplier: number;
}

/** Clip to norm C and add N(0, (zC)^2) noise. Returns a new vector. */
export function privatize(delta: Float64Array, dp: DpConfig, rng: Rng): { delta: Float64Array; clipped: boolean } {
  const n = norm(delta);
  const scale = n > dp.clip ? dp.clip / n : 1;
  const sigma = dp.noiseMultiplier * dp.clip;
  const out = new Float64Array(delta.length);
  for (let i = 0; i < delta.length; i++) out[i] = delta[i] * scale + sigma * rng.gaussian();
  return { delta: out, clipped: scale < 1 };
}

/**
 * Client-level (epsilon, delta) after `rounds` releases of the Gaussian mechanism,
 * via Renyi DP composition: RDP(alpha) = rounds * alpha / (2 z^2), then the
 * standard conversion eps = RDP(alpha) + log(1/delta) / (alpha - 1), minimized over alpha.
 * Display only, so Math.log is fine here.
 */
export function epsilon(noiseMultiplier: number, rounds: number, delta = 1e-5): number {
  if (noiseMultiplier <= 0) return Infinity;
  let best = Infinity;
  for (let alpha = 1.25; alpha <= 512; alpha *= 1.1) {
    const eps = (rounds * alpha) / (2 * noiseMultiplier * noiseMultiplier) + Math.log(1 / delta) / (alpha - 1);
    if (eps < best) best = eps;
  }
  return best;
}
