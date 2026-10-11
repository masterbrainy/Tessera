// One exchange's training node. It loads only its own slice of transactions and
// answers POST /update with a weight delta; raw transactions never leave this process.
//   tsx node/lab-server.ts --lab 1 --port 7101 [--config cfg.json]
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { EXCHANGES } from "../src/engine/data";
import { labUpdate, makeContext } from "../src/engine/federation";
import { loadConfig } from "./config";
import { loadDataset } from "./load-dataset";
import { decodeF64, encodeF64 } from "./wire";

const { values } = parseArgs({ options: { lab: { type: "string" }, port: { type: "string" }, config: { type: "string" } } });
const lab = Number(values.lab);
const port = Number(values.port ?? 7100 + lab);
const cfg = loadConfig(values.config);
const ds = loadDataset();
const mine = makeContext(cfg, ds).part.labs[lab];
if (!mine) throw new Error(`--lab must be 0..${cfg.numLabs - 1}`);
const name = EXCHANGES[lab].name;

const server = createServer((req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/info") return send(200, { lab, name, transactions: mine.length });
  if (req.method !== "POST" || req.url !== "/update") return send(404, { error: "not found" });
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { round, global } = JSON.parse(body) as { round: number; global: string };
      const t0 = Date.now();
      const u = labUpdate(cfg, ds, mine, lab, round, decodeF64(global));
      console.log(`[${name}] round ${round}: trained on ${mine.length} private tx in ${Date.now() - t0}ms`);
      send(200, { lab, n: u.n, rawNorm: u.rawNorm, clipped: u.clipped, delta: encodeF64(u.delta) });
    } catch (err) {
      console.error(`[${name}] bad request`, err);
      send(400, { error: String(err) });
    }
  });
});
server.listen(port, () => console.log(`[${name}] lab node ${lab} listening on :${port} with ${mine.length} private transactions`));
