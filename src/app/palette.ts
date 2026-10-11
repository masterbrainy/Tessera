// Petal palettes, deep at the base and light at the tip (from bloom's garden).
// One per exchange slot; attackers switch to the "thorn" palette.
export const PALETTES = {
  rose: ["#b83b5e", "#e8799a", "#fde3ea"],
  violet: ["#6d4aa8", "#b39ddb", "#efe7fb"],
  teal: ["#2f7d6d", "#7cc4b3", "#e2f4ef"],
  sky: ["#2f6aa8", "#8bb8e8", "#e5f0fb"],
  coral: ["#c2552d", "#f0a07c", "#fde9df"],
  moss: ["#4f7a3d", "#9cc489", "#eaf4e3"],
  plum: ["#8e3a7a", "#d39ac6", "#f8e6f3"],
  amber: ["#b7791f", "#f2c46d", "#fdf1d8"],
  thorn: ["#5b4636", "#a08a78", "#ece4dc"],
  plain: ["#8a7866", "#cbbba8", "#f6efe6"],
} as const;

export type PaletteKey = keyof typeof PALETTES;

const ORDER: PaletteKey[] = ["rose", "violet", "teal", "sky", "coral", "moss", "plum", "amber"];

export function paletteOf(lab: number, attacker = false): PaletteKey {
  return attacker ? "thorn" : ORDER[lab % ORDER.length];
}

export function colorOf(lab: number, attacker = false): string {
  return PALETTES[paletteOf(lab, attacker)][1];
}

export const pct = (x: number, digits = 1) => (Number.isFinite(x) ? `${(100 * x).toFixed(digits)}%` : "—");
export const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
export const usd = (bps: number) => `${((bps / 10000) * 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })} cUSD`;
