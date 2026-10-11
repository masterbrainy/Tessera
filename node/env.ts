import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";

/** Minimal .env reader; fails fast if the deployer key is missing. */
export function loadEnv(): { DEPLOYER_KEY: Hex; RPC_URL: string } {
  const file = fileURLToPath(new URL("../.env", import.meta.url));
  const vars: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) vars[m[1]] = m[2];
    }
  }
  const key = process.env.DEPLOYER_KEY ?? vars.DEPLOYER_KEY;
  if (!key?.startsWith("0x")) throw new Error("DEPLOYER_KEY missing: put it in .env");
  return { DEPLOYER_KEY: key as Hex, RPC_URL: process.env.RPC_URL ?? vars.RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545" };
}
