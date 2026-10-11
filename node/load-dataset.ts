import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDataset, type Dataset, type RawDataset } from "../src/engine/data";

const DATA = fileURLToPath(new URL("../public/data/elliptic.json", import.meta.url));

export function loadDataset(): Dataset {
  return parseDataset(JSON.parse(readFileSync(DATA, "utf8")) as RawDataset);
}
