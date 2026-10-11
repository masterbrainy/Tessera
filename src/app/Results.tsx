import React, { useState } from "react";
import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { ToggleButton, ToggleButtonGroup, Tooltip as MuiTooltip } from "@mui/material";
import { motion } from "framer-motion";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EXCHANGES } from "../engine/data";
import { payoutShares, type Scores } from "../engine/federation";
import type { FedState } from "./useFederation";
import { Blossom } from "./Garden.jsx";
import { colorOf, paletteOf, pct } from "./palette";

type Metric = "catchRate" | "auc";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--muted)">{children}</Text>;
}

function Panel({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.45 }}>
      <Box p={6} borderRadius="16px" bg="var(--panel)" border="1px solid var(--line)">{children}</Box>
    </motion.div>
  );
}

function Headline({ state }: { state: FedState }) {
  const last = state.rounds.at(-1);
  if (!last) return null;
  const attackers = new Set(state.cfg.attacks.map((a) => a.lab));
  const soloFinal = Object.entries(state.solo)
    .filter(([lab]) => !attackers.has(Number(lab)))
    .map(([lab, c]) => ({ lab: Number(lab), s: c.at(-1) }))
    .filter((x): x is { lab: number; s: Scores } => !!x.s);
  const best = soloFinal.sort((a, b) => b.s.catchRate - a.s.catchRate)[0];
  const pooled = state.pooled.at(-1);
  const stats: [string, string, string][] = [
    ["Consortium model", pct(last.test.catchRate), "of illicit tx caught at a 1% false-alarm rate"],
    ["Best exchange alone", best ? pct(best.s.catchRate) : "…", best ? `${EXCHANGES[best.lab].name}, on its own data only` : "training baselines…"],
    ["Pooling all raw data", pooled ? pct(pooled.catchRate) : "…", "the privacy-violating ceiling"],
  ];
  return (
    <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={4}>
      {stats.map(([label, value, sub], i) => (
        <Box key={label} p={4} borderRadius="14px" bg={i === 0 ? "var(--accent-soft)" : "var(--panel-2)"}>
          <Text fontSize="12px" fontWeight={650} color="var(--ink-2)">{label}</Text>
          <Text fontSize="38px" fontWeight={850} lineHeight={1.1} mt={1} color={i === 0 ? "var(--accent)" : "var(--ink)"}>{value}</Text>
          <Text fontSize="12px" color="var(--muted)">{sub}</Text>
        </Box>
      ))}
    </Grid>
  );
}

function Curves({ state }: { state: FedState }) {
  const [metric, setMetric] = useState<Metric>("catchRate");
  const attackers = new Set(state.cfg.attacks.map((a) => a.lab));
  const soloLabs = Object.keys(state.solo).map(Number).filter((l) => !attackers.has(l)).sort((a, b) => a - b);
  const data = Array.from({ length: state.cfg.rounds }, (_, r) => {
    const row: Record<string, number | undefined> = { round: r + 1 };
    row.consortium = state.rounds[r]?.test[metric];
    row.pooled = state.pooled[r]?.[metric];
    for (const l of soloLabs) row[`solo${l}`] = state.solo[l][r]?.[metric];
    return row;
  });
  const fmt = (v: number) => (metric === "auc" ? v.toFixed(3) : `${(v * 100).toFixed(0)}%`);
  const finalFed = state.rounds.at(-1)?.test[metric] ?? 0;
  const soloFinals = soloLabs.map((l) => state.solo[l].at(-1)?.[metric] ?? 0);
  const poisoned = soloFinals.length > 0 && finalFed < Math.min(...soloFinals);
  const title = poisoned
    ? "Undefended, one attacker drags the shared model below every exchange alone"
    : "Together beats alone, without sharing a single transaction";
  return (
    <>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Box>
          <Eyebrow>ON WEEKS NO EXCHANGE TRAINED ON (TIME STEPS 35–49)</Eyebrow>
          <Text fontSize="22px" fontWeight={700} mt={1} color={poisoned ? "#c2410c" : undefined}>{title}</Text>
        </Box>
        <ToggleButtonGroup exclusive size="small" value={metric} onChange={(_, v) => v && setMetric(v)}>
          <ToggleButton value="catchRate" sx={{ textTransform: "none" }}>Catch rate @ 1% FPR</ToggleButton>
          <ToggleButton value="auc" sx={{ textTransform: "none" }}>ROC-AUC</ToggleButton>
        </ToggleButtonGroup>
      </Flex>
      <Box h="320px" mt={4}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="round" tick={{ fontSize: 11, fill: "#8a7663" }} stroke="#eadccb" label={{ value: "round", position: "insideBottomRight", offset: -2, fontSize: 11, fill: "#8a7663" }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: "#8a7663" }} stroke="#eadccb" domain={["auto", "auto"]} width={52} />
            <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #eadccb", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {soloLabs.map((l) => (
              <Line key={l} type="monotone" dataKey={`solo${l}`} name={`${EXCHANGES[l].name} alone`} stroke={colorOf(l)} strokeWidth={1.5} dot={false} strokeOpacity={0.85} isAnimationActive={false} />
            ))}
            <Line type="monotone" dataKey="pooled" name="Pool all raw data (ceiling)" stroke="#a8998a" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="consortium" name="Tessera consortium" stroke="#d9703a" strokeWidth={3.5} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </>
  );
}

function Payouts({ state, onPick }: { state: FedState; onPick: (lab: number) => void }) {
  const contribution = state.labs.map((l) => state.rounds.reduce((a, r) => a + (r.labs[l.lab]?.shapley ?? 0), 0));
  const bps = state.summary?.payoutBps ?? payoutShares(contribution);
  const maxAbs = Math.max(1e-12, ...contribution.map(Math.abs));
  const attackers = new Set(state.cfg.attacks.map((a) => a.lab));
  return (
    <>
      <Eyebrow>WHO GETS PAID, AND WHY</Eyebrow>
      <Text fontSize="22px" fontWeight={700} mt={1}>Paid for value added, not for volume</Text>
      <Text fontSize="14px" color="var(--ink-2)" mt={1} lineHeight={1.6}>
        Each round, the coordinator rebuilds the model from every possible subset of exchanges ({1 << state.cfg.numLabs} coalitions)
        and measures how much each exchange improves it on a shared validation window. That's its exact Shapley value.
        A 10,000 cUSD pool per run is split in proportion.
      </Text>
      <Box mt={4}>
        {state.labs.map((l, i) => {
          const c = contribution[i];
          const atk = attackers.has(l.lab);
          const rejected = state.rounds.filter((r) => r.labs[l.lab] && !r.labs[l.lab].accepted).length;
          return (
            <Flex key={l.lab} align="center" gap={3} py={3} borderBottom="1px solid var(--line)" cursor="pointer" onClick={() => onPick(l.lab)}
              _hover={{ bg: "rgba(43,33,24,.03)" }}>
              <Blossom pal={paletteOf(l.lab, atk)} size={34} wilt={atk && rejected > 0} />
              <Box w={{ base: "110px", md: "170px" }} flexShrink={0}>
                <Text fontSize="14px" fontWeight={650}>{l.name}{atk ? " · attacker" : ""}</Text>
                <Text fontSize="11px" color="var(--muted)">{l.kind} · {l.n.toLocaleString()} tx · {pct(l.illicit / l.n)} illicit</Text>
              </Box>
              <Box flex={1} position="relative" h="10px" borderRadius="6px" bg="var(--panel-2)" overflow="hidden">
                <MuiTooltip title={`Σ Shapley = ${(c * 1000).toFixed(2)} mnats of validation log-loss`}>
                  <Box position="absolute" top={0} bottom={0} left={c >= 0 ? "50%" : `${50 - (Math.abs(c) / maxAbs) * 50}%`}
                    w={`${(Math.abs(c) / maxAbs) * 50}%`} bg={c >= 0 ? colorOf(l.lab) : "#c2410c"} borderRadius="6px" />
                </MuiTooltip>
                <Box position="absolute" left="50%" top={0} bottom={0} w="1px" bg="var(--line)" />
              </Box>
              <Box w="120px" textAlign="right" flexShrink={0}>
                <Text fontSize="16px" fontWeight={750}>{(bps[i] ?? 0) === 0 ? "0" : ((bps[i] / 10000) * 10000).toLocaleString()} cUSD</Text>
                <Text fontSize="11px" color={rejected ? "#c2410c" : "var(--muted)"}>
                  {rejected ? `rejected ${rejected}/${state.rounds.length} rounds` : `${((bps[i] ?? 0) / 100).toFixed(1)}% of pool`}
                </Text>
              </Box>
            </Flex>
          );
        })}
      </Box>
    </>
  );
}

export default function Results({ state, onPick, commit }: { state: FedState; onPick: (lab: number) => void; commit: React.ReactNode }) {
  if (!state.rounds.length) return null;
  return (
    <Box id="results" mt={8} display="grid" gap={6}>
      <Panel><Headline state={state} /></Panel>
      <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 1.25fr) minmax(0, 1fr)" }} gap={6} alignItems="start">
        <Panel delay={0.1}><Curves state={state} /></Panel>
        <Panel delay={0.2}><Payouts state={state} onPick={onPick} /></Panel>
      </Grid>
      {commit}
    </Box>
  );
}
