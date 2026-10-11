import { Box, Flex, Text } from "@chakra-ui/react";
import { Chip, LinearProgress } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import Spa from "@mui/icons-material/Spa";
import Hub from "@mui/icons-material/Hub";
import Insights from "@mui/icons-material/Insights";
import GppBad from "@mui/icons-material/GppBad";
import CheckCircle from "@mui/icons-material/CheckCircle";
import { EXCHANGES } from "../engine/data";
import type { FedState } from "./useFederation";
import { pct } from "./palette";

const COLORS = { idle: "#5e8c4f", training: "#e0a030", scoring: "#8e6cc4", attack: "#c2410c", done: "#5e8c4f" } as const;
const ICONS = { idle: Spa, training: Hub, scoring: Insights, attack: GppBad, done: CheckCircle } as const;

export default function NowCard({ state, onResults }: { state: FedState; onResults: () => void }) {
  const last = state.rounds.at(-1);
  const rejected = last?.labs.filter((l) => !l.accepted) ?? [];
  const kind: keyof typeof COLORS =
    state.status === "done" ? "done" : state.status === "idle" || state.status === "error" ? "idle"
      : rejected.length && state.phase === "training" ? "attack" : state.phase === "scoring" ? "scoring" : "training";

  const title = {
    idle: state.status === "error" ? "Something went wrong" : "Ready when you are",
    training: state.status === "loading" ? "Spinning up the exchanges" : `Round ${state.round + 1} of ${state.cfg.rounds}: local training`,
    scoring: `Round ${state.round + 1}: scoring updates`,
    attack: `Round ${state.round + 1}: attacker blocked`,
    done: "Run complete",
  }[kind];

  const body = {
    idle: state.error ?? "Each blossom is an exchange holding its own customers' transactions. Press run and they'll train one shared AML model without ever sending a transaction.",
    training: "Every exchange starts from the same global model and trains on data only it can see. Only the resulting weight changes come back.",
    scoring: "The coordinator compares every update against the median of all of them, drops outliers, then replays all coalitions of exchanges to measure what each one actually added.",
    attack: `${rejected.map((l) => EXCHANGES[l.lab].name).join(", ")} sent an update pointing away from everyone else's (cosine ${rejected.map((l) => l.cosine.toFixed(2)).join(", ")}). It was screened out before it could poison the model, and it earns nothing for this round.`,
    done: "The run is fingerprinted round by round. Commit it onchain to pay every exchange in proportion to what it contributed.",
  }[kind];

  const Icon = ICONS[kind];
  const progress = state.status === "running" ? ((state.rounds.length + (state.phase === "scoring" ? 0.6 : 0.2)) / state.cfg.rounds) * 100 : 0;

  return (
    <AnimatePresence mode="wait">
      <motion.div key={`${kind}|${title}`} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.98 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
        <Box p={6} borderRadius="16px" bg="var(--panel)" border="1px solid var(--line)" boxShadow={kind === "attack" ? "0 0 0 1px #c2410c" : "none"}>
          <Text fontSize="12px" letterSpacing=".12em" color="var(--muted)" fontWeight={700}>RIGHT NOW</Text>
          <Flex align="center" gap={3} mt={2}>
            <Flex w="48px" h="48px" borderRadius="14px" align="center" justify="center" bg={`${COLORS[kind]}22`} flexShrink={0}>
              <Icon sx={{ fontSize: 28, color: COLORS[kind] }} />
            </Flex>
            <Text fontSize="22px" fontWeight={600} lineHeight={1.15}>{title}</Text>
          </Flex>
          <Text mt={3} fontSize="14px" color="var(--ink-2)" lineHeight={1.75}>{body}</Text>
          {state.status === "running" && <LinearProgress variant="determinate" value={progress} sx={{ mt: 2, borderRadius: 2 }} />}
          {last && (
            <Flex mt={4} gap={2} wrap="wrap">
              <Chip size="small" color="success" label={`catches ${pct(last.test.catchRate)} of illicit tx`} />
              <Chip size="small" variant="outlined" label={`AUC ${last.test.auc.toFixed(3)}`} />
              <Chip size="small" variant="outlined" label={`model ${last.modelHash.slice(0, 10)}…`} />
              {last.epsilon !== null && <Chip size="small" variant="outlined" label={`ε ${last.epsilon.toExponential(1)}`} />}
              {state.status === "done" && <Chip size="small" color="primary" label="See results ↓" onClick={onResults} />}
            </Flex>
          )}
        </Box>
      </motion.div>
    </AnimatePresence>
  );
}
