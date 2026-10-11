// Deploy TesseraLedger (which deploys its cUSD token) and record the addresses for the app.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ledgerAbi, ledgerBytecode } from "../../src/chain/abi";
import { CHAIN, EXPLORER } from "../../src/chain/ledger";
import { loadEnv } from "../env";

const env = loadEnv();
const account = privateKeyToAccount(env.DEPLOYER_KEY);
const transport = http(env.RPC_URL);
const pub = createPublicClient({ chain: CHAIN, transport });
const wallet = createWalletClient({ account, chain: CHAIN, transport });

const balance = await pub.getBalance({ address: account.address });
console.log(`deployer ${account.address} balance ${formatEther(balance)} tBNB`);
if (balance === 0n) throw new Error("deployer has no tBNB: fund it from the BNB testnet faucet");

const hash = await wallet.deployContract({ abi: ledgerAbi, bytecode: ledgerBytecode });
console.log(`deploy tx ${EXPLORER}/tx/${hash}`);
const receipt = await pub.waitForTransactionReceipt({ hash });
const ledger = receipt.contractAddress!;
const cusd = await pub.readContract({ address: ledger, abi: ledgerAbi, functionName: "cusd" });
const out = { chainId: CHAIN.id, ledger, cusd, deployBlock: Number(receipt.blockNumber) };
writeFileSync(fileURLToPath(new URL("../../src/chain/deployment.json", import.meta.url)), JSON.stringify(out, null, 2) + "\n");
console.log("deployed", out);
