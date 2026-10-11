import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  getAddress,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { bscTestnet } from "viem/chains";
import { ledgerAbi } from "./abi";
import deployment from "./deployment.json";
import { canonicalJson } from "../engine/hash";
import { EXCHANGES } from "../engine/data";
import type { RunConfig, RunSummary } from "../engine/federation";

export interface Deployment {
  chainId: number;
  ledger: Address | null;
  cusd: Address | null;
  deployBlock: number;
}

export const DEPLOYMENT = deployment as Deployment;
export const CHAIN: Chain = bscTestnet;
const DEFAULT_RPC = "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
// VITE_RPC_URL (browser) or RPC_URL (node) let the same code target a local chain for testing.
export const RPC_URL: string =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_RPC_URL ??
  (typeof process !== "undefined" ? process.env.RPC_URL : undefined) ??
  DEFAULT_RPC;
export const EXPLORER = "https://testnet.bscscan.com";

export function publicClient(): PublicClient {
  return createPublicClient({ chain: CHAIN, transport: http(RPC_URL) }) as PublicClient;
}

/** Each exchange's payout address: a deterministic, keyless address derived from its name. */
export function exchangeAddress(lab: number): Address {
  const h = keccak256(toHex(`tessera-exchange:${EXCHANGES[lab].name}`));
  return getAddress(`0x${h.slice(-40)}`);
}

export const E6 = 1e6;
export const E9 = 1e9;

export function commitArgs(cfg: RunConfig, summary: RunSummary) {
  const n = cfg.numLabs;
  return [
    canonicalJson(cfg),
    summary.rounds.map((r) => r.modelHash),
    summary.rounds.map((r) => Math.round(r.test.auc * E6)),
    summary.rounds.map((r) => Math.round((Number.isNaN(r.test.catchRate) ? 0 : r.test.catchRate) * E6)),
    summary.rounds.flatMap((r) => r.labs.map((l) => BigInt(Math.round(l.shapley * E9)))),
    Array.from({ length: n }, (_, i) => exchangeAddress(i)),
    summary.payoutBps,
  ] as const;
}

export async function commitRun(wallet: WalletClient, cfg: RunConfig, summary: RunSummary): Promise<Hex> {
  if (!DEPLOYMENT.ledger) throw new Error("Ledger not deployed yet");
  const [config, hashes, auc, catchRate, shapley, labs, payout] = commitArgs(cfg, summary);
  return wallet.writeContract({
    address: DEPLOYMENT.ledger,
    abi: ledgerAbi,
    functionName: "commitRun",
    args: [config, [...hashes], [...auc], [...catchRate], [...shapley], [...labs], [...payout]],
    chain: CHAIN,
    account: wallet.account!,
  });
}

export interface OnchainRun {
  runId: number;
  coordinator: Address;
  config: RunConfig;
  configHash: Hex;
  roundHashes: Hex[];
  auc: number[];
  catchRate: number[];
  /** [round][lab] */
  shapley: number[][];
  labs: Address[];
  payoutBps: number[];
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number;
}

interface RunStruct {
  blockNumber: bigint;
  timestamp: bigint;
}

/** Read the newest `limit` runs: struct gives the block, then one getLogs per block. */
export async function fetchRuns(client: PublicClient, limit = 12): Promise<OnchainRun[]> {
  const ledger = DEPLOYMENT.ledger;
  if (!ledger) return [];
  const count = Number(await client.readContract({ address: ledger, abi: ledgerAbi, functionName: "runCount" }));
  const ids = Array.from({ length: Math.min(limit, count) }, (_, k) => count - 1 - k);
  const runs = await Promise.all(
    ids.map(async (id) => {
      const raw = await client.readContract({ address: ledger, abi: ledgerAbi, functionName: "runs", args: [BigInt(id)] });
      const s: RunStruct = { timestamp: raw[7], blockNumber: raw[8] };
      const logs = await client.getLogs({ address: ledger, fromBlock: s.blockNumber, toBlock: s.blockNumber });
      const events = parseEventLogs({ abi: ledgerAbi, logs, eventName: "RunCommitted" });
      const ev = events.find((e) => Number(e.args.runId) === id);
      return ev ? decodeRun(ev.args as unknown as Record<string, unknown>, ev.transactionHash, s) : null;
    }),
  );
  return runs.filter((r): r is OnchainRun => r !== null);
}

function decodeRun(a: Record<string, unknown>, txHash: Hex, s: RunStruct): OnchainRun {
  const labs = a.labs as Address[];
  const flat = (a.shapleyE9 as bigint[]).map((v) => Number(v) / E9);
  const rounds = (a.roundHashes as Hex[]).length;
  return {
    runId: Number(a.runId),
    coordinator: a.coordinator as Address,
    config: JSON.parse(a.config as string) as RunConfig,
    configHash: a.configHash as Hex,
    roundHashes: a.roundHashes as Hex[],
    auc: (a.aucE6 as number[]).map((v) => Number(v) / E6),
    catchRate: (a.catchRateE6 as number[]).map((v) => Number(v) / E6),
    shapley: Array.from({ length: rounds }, (_, r) => flat.slice(r * labs.length, (r + 1) * labs.length)),
    labs,
    payoutBps: (a.payoutBps as number[]).map(Number),
    txHash,
    blockNumber: s.blockNumber,
    timestamp: Number(s.timestamp),
  };
}

export async function fetchEarnings(client: PublicClient, numLabs: number): Promise<bigint[]> {
  const ledger = DEPLOYMENT.ledger;
  if (!ledger) return [];
  return Promise.all(
    Array.from({ length: numLabs }, (_, i) =>
      client.readContract({ address: ledger, abi: ledgerAbi, functionName: "totalEarned", args: [exchangeAddress(i)] }),
    ),
  );
}
