import { useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Button, Chip } from "@mui/material";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { CHAIN, DEPLOYMENT, EXPLORER, commitRun, publicClient } from "../chain/ledger";
import { hashJson } from "../engine/hash";
import type { FedState } from "./useFederation";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

type Phase = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; hash: string } | { kind: "error"; text: string };

export default function CommitCard({ state, onLedger }: { state: FedState; onLedger: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const summary = state.summary;
  if (!summary) return null;
  const finalHash = summary.rounds.at(-1)?.modelHash ?? "";

  const commit = async () => {
    try {
      if (!window.ethereum) throw new Error("No browser wallet found. Install MetaMask or Rabby to commit runs yourself.");
      setPhase({ kind: "busy", text: "Connecting wallet…" });
      const probe = createWalletClient({ chain: CHAIN, transport: custom(window.ethereum) });
      const [account] = await probe.requestAddresses();
      try {
        await probe.switchChain({ id: CHAIN.id });
      } catch {
        await probe.addChain({ chain: CHAIN });
      }
      const wallet = createWalletClient({ account, chain: CHAIN, transport: custom(window.ethereum) });
      setPhase({ kind: "busy", text: "Confirm the transaction in your wallet…" });
      const hash = await commitRun(wallet, state.cfg, summary);
      setPhase({ kind: "busy", text: "Waiting for BSC testnet to include it…" });
      await publicClient().waitForTransactionReceipt({ hash });
      setPhase({ kind: "done", hash });
    } catch (err) {
      setPhase({ kind: "error", text: (err as { shortMessage?: string }).shortMessage ?? String(err) });
    }
  };

  return (
    <Box p={6} borderRadius="16px" border="1px solid var(--green)" bg="var(--green-soft)">
      <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--muted)">SETTLE ONCHAIN</Text>
      <Text fontSize="22px" fontWeight={800} mt={1}>Commit this run and pay the exchanges</Text>
      <Text fontSize="14px" color="var(--ink-2)" mt={2} lineHeight={1.7}>
        One transaction to <code>TesseraLedger</code> on BSC testnet records the exact config, the model fingerprint after each of the{" "}
        {summary.rounds.length} rounds, and every exchange's per-round contribution, and the payout split. Committed runs are then paid in AUSD on Ethereum Sepolia, pro rata.
        Because training is deterministic, anyone can replay it from the config and check every fingerprint.
      </Text>
      <Flex mt={3} gap={2} wrap="wrap">
        <Chip size="small" variant="outlined" label={`config ${hashJson(state.cfg).slice(0, 10)}…`} />
        <Chip size="small" variant="outlined" label={`final model ${finalHash.slice(0, 10)}…`} />
        <Chip size="small" variant="outlined" label={`${summary.rounds.length} round fingerprints`} />
      </Flex>
      <Flex mt={4} gap={3} align="center" wrap="wrap">
        <Button variant="contained" disabled={!DEPLOYMENT.ledger || phase.kind === "busy"} onClick={commit} sx={{ textTransform: "none", fontWeight: 700 }}>
          {phase.kind === "busy" ? phase.text : "Commit with my wallet"}
        </Button>
        <Button variant="text" onClick={onLedger} sx={{ textTransform: "none" }}>See committed runs and verify one →</Button>
      </Flex>
      {!DEPLOYMENT.ledger && <Text mt={2} fontSize="12px" color="var(--muted)">The ledger contract is being deployed; committing opens up once it's live.</Text>}
      {phase.kind === "done" && (
        <Text mt={3} fontSize="14px" color="var(--green)" fontWeight={650}>
          Committed. <a href={`${EXPLORER}/tx/${phase.hash}`} target="_blank" rel="noreferrer">View on BscScan ↗</a>
        </Text>
      )}
      {phase.kind === "error" && <Text mt={3} fontSize="13px" color="#c2410c">{phase.text}</Text>}
      <Text mt={3} fontSize="12px" color="var(--muted)">
        No wallet? Coordinator nodes commit runs from the command line with the same engine: <code>npx tsx node/coordinator.ts --spawn --submit</code>
      </Text>
    </Box>
  );
}
