import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDataset, type RawDataset } from "../src/engine/data";
import { generate, labelsFor } from "../src/app/builder/generate";
import { parseCsv } from "../src/app/builder/csv";

const raw = JSON.parse(readFileSync("public/data/elliptic.json", "utf8")) as RawDataset;
const ds = parseDataset(raw);
const schema = { features: raw.features, edges: raw.edges!, nBins: raw.nBins };

describe("data market builder", () => {
  it("generates exchanges that never share a transaction and match the requested profile", () => {
    const a = generate(ds, { size: 2000, illicitRate: 0.2, hotSteps: [4, 9], seed: 1 }, new Set());
    const b = generate(ds, { size: 2000, illicitRate: 0.1, hotSteps: [12], seed: 2 }, new Set(a.rowsUsed));
    expect(a.rows).toBe(2000);
    expect(a.rowsUsed!.filter((i) => new Set(b.rowsUsed).has(i))).toHaveLength(0);
    expect(a.cleanLabels.filter((y) => y === 1).length).toBe(400);
    expect(a.rowsUsed!.every((i) => ds.split[i] === 0)).toBe(true);
  });

  it("a compromised exchange holds inverted labels", () => {
    const a = generate(ds, { size: 500, illicitRate: 0.2, hotSteps: [], seed: 3 }, new Set());
    const bad = labelsFor(a, "compromised", 1);
    expect(Array.from(bad).every((y, i) => y === 1 - a.cleanLabels[i])).toBe(true);
  });

  it("bins an uploaded CSV the same way the preprocessing script does", () => {
    const csv = readFileSync("public/samples/kestrel.csv", "utf8").split("\n").slice(0, 301).join("\n");
    const d = parseCsv(csv, schema, "kestrel.csv");
    const byTx = new Map(Array.from(ds.txId, (t, i) => [String(t), i]));
    let same = 0;
    for (let r = 0; r < d.rows; r++) {
      const fp = ds.fp[byTx.get(d.txIds[r])!];
      const row = Array.from({ length: 64 }, (_, f) => fp[f] - f * ds.nBins);
      if (row.every((b, f) => b === d.bins[r * 64 + f])) same++;
    }
    expect(same).toBe(d.rows);
  });
});
