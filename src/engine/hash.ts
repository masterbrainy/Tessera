import { keccak256, toHex } from "viem";

/** keccak256 over the little-endian float64 bytes of the parameter vector. */
export function hashParams(p: Float64Array): `0x${string}` {
  const bytes = new Uint8Array(p.length * 8);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < p.length; i++) view.setFloat64(i * 8, p[i], true);
  return keccak256(bytes);
}

/** Canonical JSON (sorted keys) so the same config always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashJson(value: unknown): `0x${string}` {
  return keccak256(toHex(canonicalJson(value)));
}
