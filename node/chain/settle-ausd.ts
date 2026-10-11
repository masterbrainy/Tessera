// Settle committed BSC testnet runs in real AUSD on an Agora testnet (default: Ethereum Sepolia).
// Idempotent: deploys TesseraPayouts once, tops up AUSD from Agora's testnet faucet, funds the pool,
// then pays every BSC run that isn't settled yet, using that run's onchain payout split.
// Usage: npx tsx node/chain/settle-ausd.ts [--chain sepolia|base-sepolia] [--amount 1000]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia } from "viem/chains";
import { payoutsAbi, payoutsBytecode } from "../../src/chain/payoutsAbi";
import { fetchRuns, publicClient as bscClient } from "../../src/chain/ledger";
import { loadEnv } from "../env";

// Agora testnet addresses (docs.agora.finance/developer/contract-deployments): same on every listed testnet.
const AUSD: Address = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const AUSD_FAUCET: Address = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const AUSD_DECIMALS = 6;
const faucetAbi = [
  { type: "function", name: "requestFunds", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [] },
] as const;

const NETWORKS = {
  sepolia: { chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io" },
  "base-sepolia": { chain: baseSepolia, rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" },
} as const;
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const networkName = (arg("--chain") ?? "sepolia") as keyof typeof NETWORKS;
const NETWORK = NETWORKS[networkName];
if (!NETWORK) throw new Error(`unknown --chain ${networkName}; use ${Object.keys(NETWORKS).join(" or ")}`);
const EXPLORER = NETWORK.explorer;
const OUT = fileURLToPath(new URL("../../src/chain/payouts.json", import.meta.url));

interface PayoutsFile {
  chainId: number;
  payouts: Address | null;
  ausd: Address;
  explorer: string;
  deployBlock: number;
  amountPerRun: string;
  settlements: Record<string, Hex>;
}

const amountPerRun = parseUnits(arg("--amount") ?? "1000", AUSD_DECIMALS);

// The payout-chain coordinator is its own wallet (PAYOUT_KEY in .env); falls back to the BSC deployer key.
function payoutKey(): Hex {
  const file = fileURLToPath(new URL("../../.env", import.meta.url));
  const fromFile = existsSync(file) ? readFileSync(file, "utf8").match(/^PAYOUT_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1] : undefined;
  return (process.env.PAYOUT_KEY ?? fromFile ?? loadEnv().DEPLOYER_KEY) as Hex;
}
const account = privateKeyToAccount(payoutKey());
const transport = http(process.env.PAYOUT_RPC_URL ?? NETWORK.rpc);
const pub = createPublicClient({ chain: NETWORK.chain, transport });
const wallet = createWalletClient({ account, chain: NETWORK.chain, transport });

const state: PayoutsFile = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, "utf8"))
  : { chainId: NETWORK.chain.id, payouts: null, ausd: AUSD, explorer: EXPLORER, deployBlock: 0, amountPerRun: "", settlements: {} };
const save = () => writeFileSync(OUT, JSON.stringify({ ...state, amountPerRun: formatUnits(amountPerRun, AUSD_DECIMALS) }, null, 2) + "\n");

async function send(label: string, hash: Hex) {
  console.log(`${label}: ${EXPLORER}/tx/${hash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  return receipt;
}

const eth = await pub.getBalance({ address: account.address });
console.log(`deployer ${account.address} on ${NETWORK.chain.name}: ${formatEther(eth)} ETH`);
if (eth === 0n) throw new Error(`payout wallet has no ${NETWORK.chain.name} ETH for gas: fund it from a faucet first`);

// 1. Deploy the payout pool once.
if (!state.payouts) {
  const hash = await wallet.deployContract({ abi: payoutsAbi, bytecode: payoutsBytecode, args: [AUSD] });
  const receipt = await send("deploy TesseraPayouts", hash);
  state.payouts = receipt.contractAddress!;
  state.deployBlock = Number(receipt.blockNumber);
  save();
}
const pool = state.payouts;
console.log(`TesseraPayouts ${EXPLORER}/address/${pool}`);

// 2. Work out which BSC runs still need paying.
const runs = (await fetchRuns(bscClient(), 50)).sort((a, b) => a.runId - b.runId);
const pending = [];
for (const run of runs) {
  const done = await pub.readContract({ address: pool, abi: payoutsAbi, functionName: "settled", args: [BigInt(run.runId)] });
  const paysAnyone = run.payoutBps.reduce((s, b) => s + b, 0) === 10_000;
  if (!done && paysAnyone) pending.push(run);
}
console.log(`BSC runs: ${runs.length}, to settle: ${pending.map((r) => `#${r.runId}`).join(", ") || "none"}`);
if (!pending.length) {
  save();
  process.exit(0);
}

// 3. Make sure the pool can cover them: faucet -> deployer -> fund(pool).
const need = amountPerRun * BigInt(pending.length);
const inPool = await pub.readContract({ address: pool, abi: payoutsAbi, functionName: "poolBalance" });
if (inPool < need) {
  const topUp = need - inPool;
  let mine = await pub.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  while (mine < topUp) {
    await send("AUSD faucet requestFunds", await wallet.writeContract({ address: AUSD_FAUCET, abi: faucetAbi, functionName: "requestFunds", args: [account.address] }));
    const next = await pub.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    if (next <= mine) throw new Error("AUSD faucet did not pay out (rate limited?)");
    mine = next;
  }
  await send("approve AUSD", await wallet.writeContract({ address: AUSD, abi: erc20Abi, functionName: "approve", args: [pool, topUp] }));
  await send(`fund pool ${formatUnits(topUp, AUSD_DECIMALS)} AUSD`, await wallet.writeContract({ address: pool, abi: payoutsAbi, functionName: "fund", args: [topUp] }));
}

// 4. Settle each run with the exact payout split committed on BSC.
for (const run of pending) {
  const finalHash = run.roundHashes[run.roundHashes.length - 1];
  const hash = await wallet.writeContract({
    address: pool,
    abi: payoutsAbi,
    functionName: "settle",
    args: [BigInt(run.runId), finalHash, amountPerRun, run.labs, run.payoutBps],
  });
  await send(`settle BSC run #${run.runId} (${run.payoutBps.map((b) => (b / 100).toFixed(1) + "%").join(" / ")})`, hash);
  state.settlements[String(run.runId)] = hash;
  save();
}
console.log("done", state);
process.exit(0);
