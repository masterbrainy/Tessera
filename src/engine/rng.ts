import { detLog } from "./detmath";

/** xoshiro128** seeded via splitmix32. Pure integer ops, so bit-identical everywhere. */
export class Rng {
  private s = new Uint32Array(4);
  private spare: number | null = null;

  constructor(seed: number) {
    let x = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      this.s[i] = (z ^ (z >>> 16)) >>> 0;
    }
  }

  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Standard normal via the Marsaglia polar method (no trig needed). */
  gaussian(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u: number, v: number, s: number;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const f = Math.sqrt((-2 * detLog(s)) / s);
    this.spare = v * f;
    return u * f;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Derive an independent child stream (e.g. one per lab per round). */
  fork(...salt: number[]): Rng {
    let h = this.nextU32();
    for (const v of salt) h = Math.imul(h ^ (v >>> 0), 0x9e3779b1) >>> 0;
    return new Rng(h);
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Stable 32-bit seed from integers, without consuming any stream. */
export function seedFrom(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) h = Math.imul(h ^ (p >>> 0), 0x01000193) >>> 0;
  return h;
}
