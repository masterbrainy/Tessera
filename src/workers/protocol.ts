import { parseDataset, type Dataset, type RawDataset } from "../engine/data";
import type { RoundResult, RunConfig, Scores } from "../engine/federation";

let cached: Promise<Dataset> | null = null;

/** Each worker fetches and parses the dataset once (the browser HTTP cache dedupes the download). */
export function loadDataset(url: string): Promise<Dataset> {
  cached ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`dataset: HTTP ${r.status}`);
      return r.json() as Promise<RawDataset>;
    })
    .then(parseDataset);
  return cached;
}

export type LabIn =
  | { type: "init"; cfg: RunConfig; lab: number; dataUrl: string }
  | { type: "update"; round: number; global: Float64Array };
export type LabOut =
  | { type: "ready"; lab: number; n: number; illicit: number }
  | { type: "update"; lab: number; round: number; n: number; rawNorm: number; clipped: boolean; delta: Float64Array }
  | { type: "error"; message: string };

export type CoordIn =
  | { type: "init"; cfg: RunConfig; dataUrl: string }
  | { type: "coordinate"; round: number; global: Float64Array; updates: { lab: number; n: number; rawNorm: number; clipped: boolean; delta: Float64Array }[] };
export type CoordOut =
  | { type: "ready"; params: Float64Array; valSize: number; testSize: number }
  | { type: "round"; result: Omit<RoundResult, "ms">; next: Float64Array }
  | { type: "error"; message: string };

export type BaselineIn = { type: "run"; cfg: RunConfig; dataUrl: string };
export type BaselineOut =
  | { type: "solo"; lab: number; round: number; scores: Scores }
  | { type: "pooled"; round: number; scores: Scores }
  | { type: "done" }
  | { type: "error"; message: string };

export type ReplayIn = { type: "replay"; cfg: RunConfig; dataUrl: string };
export type ReplayOut =
  | { type: "round"; result: RoundResult }
  | { type: "done"; params: Float64Array }
  | { type: "error"; message: string };
