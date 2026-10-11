// Real AUSD payouts for data-market runs (Ethereum Sepolia). A sponsor pays every exchange in one
// transaction through TesseraPayoutRouter. Exchanges without a wallet are paid to a claim wallet
// whose key travels in a claim link; its holder withdraws to any address they like.
import {
  createPublicClient, createWalletClient, custom, erc20Abi, formatUnits, http, parseEther, parseUnits,
  type Address, type EIP1193Provider, type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { routerAbi } from "./routerAbi";
import ROUTER from "./router.json";

export { ROUTER };
export const AUSD: Address = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const AUSD_FAUCET: Address = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
export const AUSD_DECIMALS = 6;
export const EXPLORER = ROUTER.explorer;
/** ETH dropped into each claim wallet so its holder can pay gas for the withdrawal. */
export const GAS_DROP = parseEther("0.0001");
const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const faucetAbi = [
  { type: "function", name: "requestFunds", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [] },
] as const;

export const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
export const fmtAusd = (units: bigint) => `${Number(formatUnits(units, AUSD_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 })} AUSD`;

export interface ClaimWallet {
  key: Hex;
  address: Address;
}

export function newClaimWallet(): ClaimWallet {
  const key = generatePrivateKey();
  return { key, address: privateKeyToAccount(key).address };
}

/** The key lives in the URL fragment, which browsers never send to a server. */
export function claimLink(w: ClaimWallet, name: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  return `${base}#claim=${w.key}&name=${encodeURIComponent(name)}`;
}

export function parseClaimHash(hash: string): { wallet: ClaimWallet; name: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const key = params.get("claim");
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  return { wallet: { key: key as Hex, address: privateKeyToAccount(key as Hex).address }, name: params.get("name") ?? "Your exchange" };
}

export const ausdBalance = (address: Address) => pub.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [address] });

/* ---------- sponsor (browser wallet) ---------- */

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export async function connectSponsor() {
  if (!window.ethereum) throw new Error("No browser wallet found. Install MetaMask or Rabby to pay out.");
  const probe = createWalletClient({ chain: sepolia, transport: custom(window.ethereum) });
  const [account] = await probe.requestAddresses();
  try {
    await probe.switchChain({ id: sepolia.id });
  } catch {
    await probe.addChain({ chain: sepolia });
  }
  return { account, wallet: createWalletClient({ account, chain: sepolia, transport: custom(window.ethereum) }) };
}

type Sponsor = Awaited<ReturnType<typeof connectSponsor>>;

/** Agora's testnet faucet mints 10,000 AUSD to the caller's chosen address. */
export async function requestTestAusd({ account, wallet }: Sponsor) {
  const hash = await wallet.writeContract({ address: AUSD_FAUCET, abi: faucetAbi, functionName: "requestFunds", args: [account] });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

export interface PayRequest {
  runRef: Hex;
  amount: string;
  recipients: Address[];
  bps: number[];
  /** Claim wallets that get ETH for gas. */
  gasDrop: Address[];
}

export async function payRun({ account, wallet }: Sponsor, req: PayRequest, onStep: (s: string) => void): Promise<Hex> {
  const amount = parseUnits(req.amount, AUSD_DECIMALS);
  const router = ROUTER.router as Address;
  const allowance = await pub.readContract({ address: AUSD, abi: erc20Abi, functionName: "allowance", args: [account, router] });
  if (allowance < amount) {
    onStep("Approve AUSD in your wallet…");
    const approve = await wallet.writeContract({ address: AUSD, abi: erc20Abi, functionName: "approve", args: [router, amount] });
    onStep("Waiting for the approval to confirm…");
    await pub.waitForTransactionReceipt({ hash: approve });
  }
  onStep("Confirm the payout in your wallet…");
  const hash = await wallet.writeContract({
    address: router,
    abi: routerAbi,
    functionName: "pay",
    args: [AUSD, req.runRef, amount, req.recipients, req.bps, req.gasDrop],
    value: GAS_DROP * BigInt(req.gasDrop.length),
  });
  onStep("Waiting for the payout to confirm…");
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Payout transaction reverted.");
  return hash;
}

/* ---------- claim (key from the link) ---------- */

export async function claimBalances(address: Address) {
  const [ausd, eth] = await Promise.all([ausdBalance(address), pub.getBalance({ address })]);
  return { ausd, eth };
}

export async function withdrawAll(w: ClaimWallet, to: Address): Promise<Hex> {
  const account = privateKeyToAccount(w.key);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
  const amount = await ausdBalance(w.address);
  if (amount === 0n) throw new Error("Nothing to withdraw: this claim wallet holds no AUSD.");
  const hash = await wallet.writeContract({ address: AUSD, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Withdrawal reverted.");
  return hash;
}
