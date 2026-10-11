import { readFileSync } from "node:fs";
import { DEFAULT_CONFIG, type RunConfig } from "../src/engine/federation";

/** Default config, optionally overridden by a JSON file path or inline JSON. */
export function loadConfig(source?: string): RunConfig {
  if (!source) return DEFAULT_CONFIG;
  const text = source.trim().startsWith("{") ? source : readFileSync(source, "utf8");
  return { ...DEFAULT_CONFIG, ...(JSON.parse(text) as Partial<RunConfig>) };
}
