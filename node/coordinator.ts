// Coordinator: drives federated rounds over HTTP against independent lab nodes,
// scores contributions, and (with --submit) commits the run to TesseraLedger.
//   tsx node/coordinator.ts --labs http://localhost:7100,http://localhost:7101,... [--config cfg.json] [--submit]
//   tsx node/coordinator.ts --spawn [--submit]    (starts one lab node process per exchange first)
import { spawn, type ChildProcess } from "node:child_process";
import { parseArgs } from "node:util";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EXCHANGES } from "../src/engine/data";
import { makeContext, runFederation, type LabClient, type LabUpdate } from "../src/engine/federation";
import { canonicalJson } from "../src/engine/hash";
import { CHAIN, commitRun, EXPLORER, publicClient } from "../src/chain/ledger";
import { loadConfig } from "./config";
import { loadDataset } from "./load-dataset";
import { decodeF64, encodeF64 } from "./wire";
import { loadEnv } from "./env";

const { values } = parseArgs({
  options: {
    labs: { type: "string" },
    config: { type: "string" },
    spawn: { type: "boolean" },
    submit: { type: "boolean" },
  },
});
const cfg = loadConfig(values.config);
const children: ChildProcess[] = [];

function httpClient(lab: number, url: string): LabClient {
  return {
    lab,
    async update(round, global): Promise<LabUpdate> {
      const res = await fetch(`${url}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ round, global: encodeF64(global) }),
      });
      if (!res.ok) throw new Error(`lab ${lab} at ${url}: HTTP ${res.status} ${await res.text()}`);
      const j = (await res.json()) as { lab: number; n: number; rawNorm: number; clipped: boolean; delta: string };
      return { lab: j.lab, n: j.n, rawNorm: j.rawNorm, clipped: j.clipped, delta: decodeF64(j.delta) };
    },
  };
}

async function waitFor(url: string) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${url}/info`);
      if (r.ok) return (await r.json()) as { name: string; transactions: number };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`lab node at ${url} never came up`);
}

async function main() {
  let urls = values.labs?.split(",") ?? [];
  if (values.spawn) {
    urls = Array.from({ length: cfg.numLabs }, (_, i) => `http://localhost:${7100 + i}`);
    for (let i = 0; i < cfg.numLabs; i++) {
      const args = ["tsx", "node/lab-server.ts", "--lab", String(i), "--port", String(7100 + i), "--config", canonicalJson(cfg)];
      children.push(spawn("npx", args, { stdio: "inherit" }));
    }
  }
  if (urls.length !== cfg.numLabs) throw new Error(`need ${cfg.numLabs} lab URLs (or --spawn)`);
  for (const u of urls) {
    const info = await waitFor(u);
    console.log(`connected ${info.name} (${info.transactions} tx) at ${u}`);
  }

  const ctx = makeContext(cfg, loadDataset());
  const summary = await runFederation(ctx, urls.map((u, i) => httpClient(i, u)), {
    onRound: (r) => {
      const flagged = r.labs.filter((l) => l.flagged).map((l) => EXCHANGES[l.lab].name);
      console.log(
        `round ${r.round}: AUC ${r.test.auc.toFixed(4)}, catches ${(r.test.catchRate * 100).toFixed(1)}% of illicit @1% FPR` +
          (flagged.length ? `, rejected ${flagged.join(", ")}` : "") +
          ` | model ${r.modelHash.slice(0, 10)}…`,
      );
    },
  });
  console.log("payouts:", summary.payoutBps.map((b, i) => `${EXCHANGES[i].name} ${(b / 100).toFixed(1)}%`).join(", "));

  if (values.submit) {
    const env = loadEnv();
    const account = privateKeyToAccount(env.DEPLOYER_KEY);
    const wallet = createWalletClient({ account, chain: CHAIN, transport: http(env.RPC_URL) });
    const hash = await commitRun(wallet, cfg, summary);
    console.log(`submitted ${EXPLORER}/tx/${hash}`);
    const receipt = await publicClient().waitForTransactionReceipt({ hash });
    console.log(`confirmed in block ${receipt.blockNumber} (${receipt.status})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => children.forEach((c) => c.kill()));
