// End-to-end check of TesseraPayoutRouter on Ethereum Sepolia with real AUSD:
// sponsor (PAYOUT_KEY) pays three exchanges, one of them to a fresh claim wallet with a gas drop,
// then the claim wallet withdraws everything to another address using only the dropped ETH.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, keccak256, parseEther, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { routerAbi } from "../../src/chain/routerAbi";
import ROUTER from "../../src/chain/router.json";

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const AUSD: Address = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const FAUCET: Address = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const faucetAbi = [{ type: "function", name: "requestFunds", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [] }] as const;
const key = (process.env.PAYOUT_KEY ?? readFileSync(".env", "utf8").match(/^PAYOUT_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1]) as Hex;
const sponsor = privateKeyToAccount(key);
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const wallet = createWalletClient({ account: sponsor, chain: sepolia, transport: http(RPC) });
const bal = (a: Address) => pub.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [a] });
const wait = (hash: Hex) => pub.waitForTransactionReceipt({ hash });

const amount = parseUnits("100", 6);
if ((await bal(sponsor.address)) < amount) await wait(await wallet.writeContract({ address: FAUCET, abi: faucetAbi, functionName: "requestFunds", args: [sponsor.address] }));
console.log("sponsor AUSD", formatUnits(await bal(sponsor.address), 6));

const claim = privateKeyToAccount(generatePrivateKey());
const withWallet = privateKeyToAccount(generatePrivateKey()).address;
const compromised = privateKeyToAccount(generatePrivateKey()).address;
await wait(await wallet.writeContract({ address: AUSD, abi: erc20Abi, functionName: "approve", args: [ROUTER.router as Address, amount] }));
const pay = await wallet.writeContract({
  address: ROUTER.router as Address, abi: routerAbi, functionName: "pay",
  args: [AUSD, keccak256(toHex("test-run")), amount, [withWallet, claim.address, compromised], [6000, 4000, 0], [claim.address]],
  value: parseEther("0.0001"),
});
const r = await wait(pay);
console.log("pay", r.status, `${ROUTER.explorer}/tx/${pay}`);
console.log("with-wallet", formatUnits(await bal(withWallet), 6), "claim", formatUnits(await bal(claim.address), 6), "compromised", formatUnits(await bal(compromised), 6), "claim ETH", formatEther(await pub.getBalance({ address: claim.address })));

const dest = privateKeyToAccount(generatePrivateKey()).address;
const claimWallet = createWalletClient({ account: claim, chain: sepolia, transport: http(RPC) });
const w = await claimWallet.writeContract({ address: AUSD, abi: erc20Abi, functionName: "transfer", args: [dest, await bal(claim.address)] });
console.log("withdraw", (await wait(w)).status, `${ROUTER.explorer}/tx/${w}`, "dest AUSD", formatUnits(await bal(dest), 6), "claim left", formatUnits(await bal(claim.address), 6));
