// Turns a member's own CSV export into the model's input format, entirely in the browser.
// The consortium agrees on one feature schema (the 64 Elliptic features here); each raw value
// is quantile-binned with the shared edges, so every member's rows mean the same thing.
import type { RawDataset } from "../../engine/data";
import type { ExchangeData } from "./generate";

export interface Schema {
  features: string[];
  edges: number[][];
  nBins: number;
}

export const SAMPLE_BASE = `${import.meta.env.BASE_URL}samples/`;
export const SAMPLES = ["harbor", "meridian", "kestrel", "atlas", "lumen"] as const;
export const LABEL_COLUMNS = ["is_illicit", "label", "class"];
const ID_COLUMNS = ["tx_id", "txid", "id", "transaction_id"];

let schemaPromise: Promise<Schema> | null = null;

export function loadSchema(): Promise<Schema> {
  schemaPromise ??= fetch(`${import.meta.env.BASE_URL}data/elliptic.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`schema: HTTP ${r.status}`);
      return r.json() as Promise<RawDataset>;
    })
    .then((raw) => {
      if (!raw.edges) throw new Error("dataset has no bin edges; rerun scripts/preprocess.py");
      return { features: raw.features, edges: raw.edges, nBins: raw.nBins };
    });
  return schemaPromise;
}

/** Number of edges <= v (numpy searchsorted side="right"). */
function binOf(edges: number[], v: number): number {
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function parseLabel(cell: string | undefined): number {
  const v = (cell ?? "").trim().toLowerCase();
  if (v === "1" || v === "illicit" || v === "true" || v === "yes") return 1;
  if (v === "0" || v === "2" || v === "licit" || v === "false" || v === "no") return 0;
  return -1;
}

export function parseCsv(text: string, schema: Schema, fileName: string, requireLabels = true): ExchangeData {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) throw new Error("The file has no data rows.");
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const col = new Map(header.map((h, i) => [h, i]));
  const missing = schema.features.filter((f) => !col.has(f.toLowerCase()));
  if (missing.length) {
    throw new Error(`Missing ${missing.length} required feature column(s): ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "…" : ""}. Download the template to see the schema.`);
  }
  const featCols = schema.features.map((f) => col.get(f.toLowerCase())!);
  const labelCol = LABEL_COLUMNS.map((c) => col.get(c)).find((i) => i !== undefined);
  const idCol = ID_COLUMNS.map((c) => col.get(c)).find((i) => i !== undefined);
  const stepCol = col.get("time_step");
  const F = schema.features.length;
  const rows = lines.length - 1;
  const bins = new Uint8Array(rows * F);
  const labels = new Int8Array(rows).fill(-1);
  const txIds: string[] = new Array(rows);
  const steps = stepCol === undefined ? null : new Uint8Array(rows);
  let labeled = 0;
  for (let r = 0; r < rows; r++) {
    const cells = lines[r + 1].split(",");
    for (let f = 0; f < F; f++) {
      const v = Number(cells[featCols[f]]);
      if (!Number.isFinite(v)) throw new Error(`Row ${r + 2}: "${schema.features[f]}" is not a number.`);
      bins[r * F + f] = binOf(schema.edges[f], v);
    }
    const y = labelCol === undefined ? -1 : parseLabel(cells[labelCol]);
    labels[r] = y;
    if (y >= 0) labeled++;
    if (steps) steps[r] = Number(cells[stepCol!]) || 0;
    txIds[r] = idCol === undefined ? String(r + 1) : (cells[idCol] ?? "").trim();
  }
  if (!labeled && requireLabels) throw new Error("No labeled rows: add an is_illicit column (1 = fraud, 0 = legitimate) so this data can teach the model.");
  return { source: "uploaded", fileName, bins, cleanLabels: labels, txIds, steps, rows };
}

export async function fetchSample(name: string, schema: Schema): Promise<ExchangeData> {
  const r = await fetch(`${SAMPLE_BASE}${name}.csv`);
  if (!r.ok) throw new Error(`sample ${name}: HTTP ${r.status}`);
  return parseCsv(await r.text(), schema, `${name}.csv`);
}

export function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
