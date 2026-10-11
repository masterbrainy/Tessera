import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Chip, Dialog, IconButton } from "@mui/material";
import { motion } from "framer-motion";
import { EXCHANGES } from "../engine/data";
import { exchangeAddress, EXPLORER } from "../chain/ledger";
import type { FedState } from "./useFederation";
import { Blossom } from "./Garden.jsx";
import { PALETTES, paletteOf, pct } from "./palette";

function Section({ title, children, delay }: { title: string; children: React.ReactNode; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}>
      <Box mt={5}>
        <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--muted)" mb={2}>{title}</Text>
        {children}
      </Box>
    </motion.div>
  );
}

export default function ExchangeDialog({ lab, state, onClose }: { lab: number | null; state: FedState; onClose: () => void }) {
  const open = lab !== null;
  const l = open ? state.labs.find((x) => x.lab === lab) : undefined;
  const x = open ? EXCHANGES[lab] : EXCHANGES[0];
  const attack = open ? state.cfg.attacks.find((a) => a.lab === lab) : undefined;
  const pal = paletteOf(lab ?? 0, !!attack);
  const rows = open ? state.rounds.map((r) => ({ round: r.round, ...r.labs[lab] })).filter((r) => r.lab !== undefined) : [];
  const earned = open && state.summary ? state.summary.payoutBps[lab] : null;
  const addr = open ? exchangeAddress(lab) : "";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { bgcolor: "var(--panel)", backgroundImage: "none", borderRadius: "22px", overflow: "hidden" } }}>
      {open && (
        <Box position="relative">
          <Box position="absolute" inset={0} h="170px" bg={`linear-gradient(180deg, ${PALETTES[pal][2]} 0%, transparent 100%)`} />
          <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12, color: "var(--muted)", zIndex: 1 }}>✕</IconButton>
          <Box position="relative" px={7} pt={6} pb={7}>
            <Flex align="center" gap={5}>
              <Blossom pal={pal} size={96} />
              <Box minW={0}>
                <Text fontSize="26px" fontWeight={800} lineHeight={1.15}>{x.name}</Text>
                <Text mt={1} fontSize="16px" color="var(--ink-2)">{x.kind}</Text>
                <Flex mt={3} gap={2} wrap="wrap">
                  <Chip size="small" label={attack ? "Malicious in this scenario" : "Honest member"}
                    sx={{ bgcolor: PALETTES[pal][2], color: PALETTES[pal][0], fontWeight: 600 }} />
                  {earned !== null && <Chip size="small" variant="outlined" label={`earned ${(earned / 100).toFixed(1)}% of the pool`} />}
                </Flex>
              </Box>
            </Flex>

            <Section title="WHAT IT HOLDS" delay={0.3}>
              <Text fontSize="15px" color="var(--ink-2)" lineHeight={1.6}>
                {l ? `${l.n.toLocaleString()} labeled Bitcoin transactions from its own customers, ${pct(l.illicit / l.n)} of them illicit. ` : ""}
                They live inside this exchange's own Web Worker (or its own server, in node mode) and are never sent anywhere.
                {x.illicitBias > 1.5 ? " As a higher-risk venue, it sees more scam and laundering flow than most, which makes its data unusually valuable." : ""}
                {x.illicitBias < 0.5 ? " As a regulated custodian, it sees lots of clean volume but few illicit patterns, so its marginal value is lower than its size suggests." : ""}
              </Text>
            </Section>

            {attack && (
              <Section title="WHAT IT TRIED" delay={0.4}>
                <Text fontSize="15px" color="#c2410c" lineHeight={1.6}>
                  {attack.type === "signFlip" && "Model poisoning: every round it sends its honest update reversed and boosted 4×, trying to steer the shared model backwards."}
                  {attack.type === "labelFlip" && "Label flipping: it trains on inverted labels, trying to teach the model that its laundering flows look clean."}
                  {attack.type === "noise" && "Free-riding: it sends random weights instead of training, hoping to collect rewards for nothing."}
                </Text>
              </Section>
            )}

            {rows.length > 0 && (
              <Section title="WHAT IT SENT, ROUND BY ROUND" delay={0.5}>
                <Box fontSize="13px">
                  <Flex color="var(--muted)" py={1} borderBottom="1px solid var(--line)">
                    <Box w="60px">Round</Box><Box flex={1}>Agreement with others</Box><Box w="90px">Verdict</Box><Box w="90px" textAlign="right">Shapley</Box>
                  </Flex>
                  {rows.map((r) => (
                    <Flex key={r.round} py={1} borderBottom="1px solid var(--line)">
                      <Box w="60px">{r.round + 1}</Box>
                      <Box flex={1}>cos {r.cosine.toFixed(2)} · size ×{r.normRatio.toFixed(1)}</Box>
                      <Box w="90px" color={r.accepted ? "var(--green)" : "#c2410c"} fontWeight={650}>{r.accepted ? "merged" : "rejected"}</Box>
                      <Box w="90px" textAlign="right">{(r.shapley * 1000).toFixed(2)}</Box>
                    </Flex>
                  ))}
                </Box>
                <Text fontSize="11px" color="var(--muted)" mt={2}>Shapley in milli-nats of validation log-loss reduction. Cosine is against the coordinate-wise median of all updates.</Text>
              </Section>
            )}

            <Section title="PAYOUT ADDRESS" delay={0.6}>
              <a href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: "break-all" }}>{addr} ↗</a>
            </Section>
          </Box>
        </Box>
      )}
    </Dialog>
  );
}
