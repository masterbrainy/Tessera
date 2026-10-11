// Deterministic transcendental functions.
//
// ECMAScript only guarantees bit-exact results for + - * / and sqrt. Math.exp,
// Math.log, etc. are "implementation-approximated", so V8, JavaScriptCore and
// SpiderMonkey may disagree in the last bit. Training must be bit-reproducible
// across Node and every browser (anyone can replay a run and check the onchain
// model hashes), so everything that feeds into weights uses these instead.

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;

const scratch = new DataView(new ArrayBuffer(8));

/** 2^k for integer k in [-1022, 1023], built directly from the exponent bits. */
function pow2(k: number): number {
  scratch.setUint32(0, (k + 1023) << 20);
  scratch.setUint32(4, 0);
  return scratch.getFloat64(0);
}

export function detExp(x: number): number {
  if (x > 700) x = 700;
  if (x < -700) x = -700;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO; // |r| <= ln2/2
  // Taylor series to r^13: truncation error < 1e-17 on |r| <= 0.347
  let p = 1 / 6227020800;
  p = p * r + 1 / 479001600;
  p = p * r + 1 / 39916800;
  p = p * r + 1 / 3628800;
  p = p * r + 1 / 362880;
  p = p * r + 1 / 40320;
  p = p * r + 1 / 5040;
  p = p * r + 1 / 720;
  p = p * r + 1 / 120;
  p = p * r + 1 / 24;
  p = p * r + 1 / 6;
  p = p * r + 0.5;
  p = p * r + 1;
  p = p * r + 1;
  return p * pow2(k);
}

export function detLog(x: number): number {
  if (!(x > 0)) return -Infinity;
  scratch.setFloat64(0, x);
  const hi = scratch.getUint32(0);
  let e = ((hi >>> 20) & 0x7ff) - 1023;
  // mantissa in [1, 2)
  scratch.setUint32(0, (hi & 0x000fffff) | 0x3ff00000);
  let m = scratch.getFloat64(0);
  if (m > Math.SQRT2) {
    m /= 2;
    e += 1;
  }
  // log(m) = 2 atanh(s), s = (m-1)/(m+1), |s| <= 0.1716
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let p = 1 / 23;
  for (let d = 21; d >= 1; d -= 2) p = p * s2 + 1 / d;
  return e * LN2_HI + e * LN2_LO + 2 * s * p;
}

export function sigmoid(z: number): number {
  return 1 / (1 + detExp(-z));
}
