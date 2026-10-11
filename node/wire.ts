// Float64 vectors travel as base64 of their exact bytes, so HTTP labs stay bit-identical to in-process ones.
export function encodeF64(v: Float64Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
}

export function decodeF64(s: string): Float64Array {
  const buf = Buffer.from(s, "base64");
  const out = new Float64Array(buf.byteLength / 8);
  new Uint8Array(out.buffer).set(buf);
  return out;
}
