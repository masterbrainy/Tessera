// Reads real AUSD settlements from TesseraPayouts on Ethereum Sepolia (see node/chain/settle-ausd.ts).
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { payoutsAbi } from "./payoutsAbi";
import { exchangeAddress } from "./ledger";
import PAYOUTS from "./payouts.json";

export { PAYOUTS };
export const AUSD_DECIMALS = 6n;
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

/** AUSD each exchange has actually been paid across every settled run (6-decimal units). */
export async function fetchAusdEarnings(numLabs: number): Promise<bigint[]> {
  const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
  return Promise.all(
    Array.from({ length: numLabs }, (_, i) =>
      client.readContract({ address: PAYOUTS.payouts as Address, abi: payoutsAbi, functionName: "totalEarned", args: [exchangeAddress(i)] }),
    ),
  );
}

export const formatAusd = (units: bigint) =>
  `${(Number(units) / 10 ** Number(AUSD_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 1 })} AUSD`;
