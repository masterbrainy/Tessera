import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Flex, Grid, Link, Text } from "@chakra-ui/react";
import { Button, Chip, LinearProgress } from "@mui/material";
import { motion } from "framer-motion";
import { EXCHANGES } from "../engine/data";
import type { RunConfig } from "../engine/federation";
import PAYOUTS from "../chain/payouts.json";
import { DEPLOYMENT, EXPLORER, exchangeAddress, fetchEarnings, fetchRuns, publicClient, type OnchainRun } from "../chain/ledger";
import type { ReplayIn, ReplayOut } from "../workers/protocol";
import { DATA_URL } from "./useFederation";
import { colorOf, pct, short } from "./palette";

const POLL_MS = 20_000;
const RUN_LIMIT = 12;
const DEFAULT_LABS = 5;
const SHAPLEY_TOLERANCE = 1e-9;
const EARNINGS_DECIMALS = 18n;

const eyebrow = { fontSize: "11px", letterSpacing: ".12em", fontWeight: 700, color: "var(--muted)" } as const;
const panelProps = { p: 6, borderRadius: "16px", bg: "var(--panel)", border: "1px solid var(--line)" } as const;
const MotionBox = motion(Box);

/* ---------- small helpers ---------- */

function relativeTime(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

function formatCusd(wei: bigint): string {
  const whole = Number(wei / 10n ** EARNINGS_DECIMALS);
  return `${whole.toLocaleString()} cUSD`;
}

const attackerLabs = (cfg: RunConfig): Set<number> => new Set(cfg.attacks.map((a) => a.lab));
const labName = (lab: number) => EXCHANGES[lab]?.name ?? `Exchange ${lab}`;

/* ---------- data: runs + earnings, polled ---------- */

interface LedgerData {
  runs: OnchainRun[];
  earnings: bigint[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

function useLedgerData(): LedgerData {
  const [runs, setRuns] = useState<OnchainRun[]>([]);
  const [earnings, setEarnings] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(Boolean(DEPLOYMENT.ledger));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!DEPLOYMENT.ledger) return;
    let cancelled = false;
    const load = async () => {
      try {
        const client = publicClient();
        const fetched = await fetchRuns(client, RUN_LIMIT);
        const labs = Math.max(DEFAULT_LABS, ...fetched.map((r) => r.config.numLabs));
        const earned = await fetchEarnings(client, labs);
        if (cancelled) return;
        setRuns([...fetched].sort((a, b) => b.runId - a.runId));
        setEarnings(earned);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tick]);

  const retry = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);
  return { runs, earnings, loading, error, retry };
}

/* ---------- replay & verify ---------- */

type RoundCheck = "ok" | "hash" | "shapley";
type ReplayStatus = "idle" | "running" | "done" | "error";

interface ReplayState {
  status: ReplayStatus;
  checks: RoundCheck[];
  progress: string;
  message: string | null;
}

const IDLE: ReplayState = { status: "idle", checks: [], progress: "", message: null };

function checkRound(run: OnchainRun, out: Extract<ReplayOut, { type: "round" }>): { check: RoundCheck; label: string } {
  const { result } = out;
  const total = run.roundHashes.length;
  const expected = run.roundHashes[result.round];
  const hashOk = expected !== undefined && result.modelHash.toLowerCase() === expected.toLowerCase();
  const committed = run.shapley[result.round] ?? [];
  const shapleyOk = result.labs.every((l, i) => Math.abs(l.shapley - (committed[i] ?? Number.NaN)) <= SHAPLEY_TOLERANCE);
  const check: RoundCheck = !hashOk ? "hash" : shapleyOk ? "ok" : "shapley";
  const verb = check === "ok" ? "matches" : check === "hash" ? "does NOT match" : "hash matches, scores differ";
  return { check, label: `Round ${result.round + 1}/${total} · ${short(result.modelHash)} ${verb}` };
}

function useReplay(run: OnchainRun) {
  const [state, setState] = useState<ReplayState>(IDLE);
  const workerRef = useRef<Worker | null>(null);

  const stop = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    stop();
    const worker = new Worker(new URL("../workers/replay.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setState({ status: "running", checks: [], progress: "Loading the dataset…", message: null });
    worker.onmessage = (e: MessageEvent<ReplayOut>) => {
      const msg = e.data;
      if (msg.type === "round") {
        const { check, label } = checkRound(run, msg);
        setState((s) => ({ ...s, checks: [...s.checks, check], progress: label }));
      } else if (msg.type === "done") {
        setState((s) => ({ ...s, status: "done" }));
        stop();
      } else {
        setState((s) => ({ ...s, status: "error", message: msg.message }));
        stop();
      }
    };
    worker.onerror = (e) => {
      setState((s) => ({ ...s, status: "error", message: e.message || "The replay worker crashed." }));
      stop();
    };
    const request: ReplayIn = { type: "replay", cfg: run.config, dataUrl: DATA_URL };
    worker.postMessage(request);
  }, [run, stop]);

  return { state, start };
}

function RoundSquares({ checks, total, running }: { checks: RoundCheck[]; total: number; running: boolean }) {
  return (
    <Flex gap="6px" wrap="wrap" aria-label="Per-round verification">
      {Array.from({ length: total }, (_, i) => {
        const check = checks[i];
        const bg = check === undefined ? "var(--panel-2)" : check === "ok" ? "var(--green)" : "#b4532a";
        return (
          <Flex
            key={i}
            w="22px"
            h="22px"
            borderRadius="6px"
            align="center"
            justify="center"
            color="#fffdf9"
            fontSize="12px"
            fontWeight={700}
            bg={bg}
            opacity={check === undefined && !running ? 0.6 : 1}
            title={`Round ${i + 1}`}
          >
            {check === undefined ? "" : check === "ok" ? "✓" : "✗"}
          </Flex>
        );
      })}
    </Flex>
  );
}

function ReplayPanel({ run }: { run: OnchainRun }) {
  const { state, start } = useReplay(run);
  const total = run.roundHashes.length;
  const bad = state.checks.map((c, i) => [c, i] as const).filter(([c]) => c !== "ok");
  const verified = state.status === "done" && bad.length === 0 && state.checks.length === total;

  return (
    <Box>
      <Flex align="center" gap={3} wrap="wrap">
        <Button variant="contained" size="small" onClick={start} disabled={state.status === "running"} disableElevation>
          {state.status === "running" ? "Replaying…" : state.status === "idle" ? "Replay & verify" : "Replay again"}
        </Button>
        {state.status === "idle" && (
          <Text fontSize="13px" color="var(--muted)">
            Re-trains this run in your browser and compares every hash.
          </Text>
        )}
      </Flex>
      {state.status !== "idle" && (
        <Box mt={4}>
          <RoundSquares checks={state.checks} total={total} running={state.status === "running"} />
          {state.status === "running" && (
            <Box mt={3}>
              <LinearProgress variant="determinate" value={(100 * state.checks.length) / total} color="inherit" sx={{ height: 5, borderRadius: 3, color: "var(--accent)" }} />
              <Text mt={2} fontSize="13px" color="var(--ink-2)">{state.progress}</Text>
            </Box>
          )}
          {verified && (
            <Box mt={3} p={3} borderRadius="12px" bg="var(--green-soft)" border="1px solid var(--green)">
              <Text fontSize="14px" fontWeight={600} color="var(--green)">
                Verified: all {total} model hashes and every contribution score reproduced in your browser
              </Text>
            </Box>
          )}
          {state.status === "done" && !verified && (
            <Box mt={3} p={3} borderRadius="12px" bg="rgba(180,83,42,.08)" border="1px solid #b4532a">
              <Text fontSize="14px" fontWeight={600} color="#b4532a">Mismatch: this run did not reproduce</Text>
              {bad.map(([c, i]) => (
                <Text key={i} fontSize="13px" color="var(--ink-2)">
                  Round {i + 1}: {c === "hash" ? "model hash differs from the committed one" : "contribution scores differ from the committed ones"}
                </Text>
              ))}
              {state.checks.length < total && <Text fontSize="13px" color="var(--ink-2)">Only {state.checks.length} of {total} rounds were produced.</Text>}
            </Box>
          )}
          {state.status === "error" && (
            <Box mt={3} p={3} borderRadius="12px" bg="rgba(180,83,42,.08)" border="1px solid #b4532a">
              <Text fontSize="13px" color="#b4532a">Replay failed: {state.message}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

/* ---------- run card ---------- */

function PayoutBar({ run }: { run: OnchainRun }) {
  const attackers = attackerLabs(run.config);
  const total = run.payoutBps.reduce((a, b) => a + b, 0) || 1;
  return (
    <Box>
      <Flex h="22px" borderRadius="11px" overflow="hidden" bg="var(--panel-2)" role="img" aria-label="Payout split">
        {run.payoutBps.map((bps, lab) =>
          bps > 0 ? <Box key={lab} flex={`${bps} 0 0`} bg={colorOf(lab, attackers.has(lab))} title={`${labName(lab)} ${pct(bps / total)}`} /> : null,
        )}
      </Flex>
      <Flex mt={2} gap={4} wrap="wrap">
        {run.payoutBps.map((bps, lab) => (
          <Flex key={lab} align="center" gap="6px" fontSize="12px" color="var(--ink-2)">
            <Box w="8px" h="8px" borderRadius="50%" bg={colorOf(lab, attackers.has(lab))} />
            {labName(lab)} {pct(bps / total)}
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}

function ConfigChips({ cfg }: { cfg: RunConfig }) {
  const chips = [
    `${cfg.numLabs} exchanges`,
    `${cfg.rounds} rounds`,
    cfg.aggregator,
    ...cfg.attacks.map((a) => `${labName(a.lab)} attacks (${a.type})`),
    cfg.dp.enabled ? "DP on" : "DP off",
  ];
  return (
    <Flex gap={2} wrap="wrap">
      {chips.map((c) => (
        <Chip key={c} label={c} size="small" variant="outlined" />
      ))}
    </Flex>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text {...eyebrow}>{label}</Text>
      <Text fontSize="22px" fontWeight={700} color="var(--ink)">{value}</Text>
    </Box>
  );
}

/** Real AUSD settlement for a committed run (TesseraPayouts on Ethereum Sepolia), if it has been paid. */
function AusdLink({ runId }: { runId: number }) {
  const tx = (PAYOUTS.settlements as Record<string, string>)[String(runId)];
  if (!tx) return <Text fontSize="12px" color="var(--muted)">AUSD payout pending</Text>;
  return (
    <Link href={`${PAYOUTS.explorer}/tx/${tx}`} isExternal fontSize="13px" color="var(--green)" fontWeight={650}>
      Paid {Number(PAYOUTS.amountPerRun).toLocaleString()} AUSD on Ethereum Sepolia ↗
    </Link>
  );
}

function RunCard({ run, index }: { run: OnchainRun; index: number }) {
  const finalCatch = run.catchRate[run.catchRate.length - 1];
  const finalAuc = run.auc[run.auc.length - 1];
  return (
    <MotionBox {...panelProps} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * index }}>
      <Flex justify="space-between" align="baseline" wrap="wrap" gap={2}>
        <Text fontSize="18px" fontWeight={700} color="var(--ink)">Run #{run.runId}</Text>
        <Text fontSize="13px" color="var(--muted)">
          {relativeTime(run.timestamp)} · coordinator{" "}
          <Link href={`${EXPLORER}/address/${run.coordinator}`} isExternal color="var(--ink-2)">{short(run.coordinator)}</Link>
        </Text>
      </Flex>
      <Box mt={3}><ConfigChips cfg={run.config} /></Box>
      <Flex mt={5} gap={10} wrap="wrap">
        <Fact label="CATCH RATE" value={pct(finalCatch)} />
        <Fact label="ROC-AUC" value={finalAuc === undefined ? "—" : finalAuc.toFixed(3)} />
      </Flex>
      <Box mt={5}>
        <Text {...eyebrow} mb={2}>PAYOUT SPLIT</Text>
        <PayoutBar run={run} />
      </Box>
      <Box mt={5} pt={5} borderTop="1px solid var(--line)">
        <Flex justify="space-between" align="flex-start" gap={4} wrap="wrap">
          <ReplayPanel run={run} />
          <Flex direction="column" align="flex-end" gap={1}>
            <Link href={`${EXPLORER}/tx/${run.txHash}`} isExternal fontSize="13px" color="var(--accent)" fontWeight={600}>
              Committed on BSC ↗
            </Link>
            <AusdLink runId={run.runId} />
          </Flex>
        </Flex>
      </Box>
    </MotionBox>
  );
}

/* ---------- earnings ---------- */

function EarningsPanel({ earnings }: { earnings: bigint[] }) {
  const rows = earnings.map((wei, lab) => ({ wei, lab })).filter((r) => r.wei > 0n || r.lab < DEFAULT_LABS).slice(0, EXCHANGES.length);
  const max = rows.reduce((m, r) => (r.wei > m ? r.wei : m), 0n);
  return (
    <Box {...panelProps}>
      <Text {...eyebrow}>EXCHANGE EARNINGS</Text>
      <Text mt={1} mb={4} fontSize="14px" color="var(--ink-2)">Total cUSD each exchange has earned across every committed run.</Text>
      <Flex direction="column" gap={4}>
        {rows.map(({ wei, lab }) => {
          const addr = exchangeAddress(lab);
          const width = max > 0n ? Number((wei * 10000n) / max) / 100 : 0;
          return (
            <Box key={lab}>
              <Flex justify="space-between" align="baseline" gap={3} wrap="wrap">
                <Flex align="center" gap={2}>
                  <Box w="10px" h="10px" borderRadius="50%" bg={colorOf(lab)} />
                  <Text fontSize="14px" fontWeight={600} color="var(--ink)">{labName(lab)}</Text>
                  <Text fontSize="12px" color="var(--muted)">{EXCHANGES[lab]?.kind}</Text>
                </Flex>
                <Text fontSize="14px" fontWeight={600} color="var(--ink)">{formatCusd(wei)}</Text>
              </Flex>
              <Box mt={2} h="8px" borderRadius="4px" bg="var(--panel-2)" overflow="hidden">
                <Box h="100%" w={`${width}%`} bg={colorOf(lab)} borderRadius="4px" transition="width .4s" />
              </Box>
              <Link href={`${EXPLORER}/address/${addr}`} isExternal fontSize="11px" color="var(--muted)">{short(addr)}</Link>
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
}

/* ---------- explainer + page ---------- */

const STEPS = [
  { title: "1. Read the commitment", body: "The contract stores the exact run config, a fingerprint of the model after every round, and every exchange's contribution score." },
  { title: "2. Re-run it here", body: "Training is bit-for-bit deterministic, so your browser re-trains the federation from the config alone, with no trust in the coordinator." },
  { title: "3. Compare", body: "Each round's model hash and Shapley scores must equal what was committed. A single flipped bit anywhere changes the hash." },
];

function Explainer() {
  return (
    <Box {...panelProps}>
      <Text {...eyebrow}>HOW VERIFICATION WORKS</Text>
      <Grid mt={4} gap={6} templateColumns="repeat(auto-fit, minmax(240px, 1fr))">
        {STEPS.map((s) => (
          <Box key={s.title}>
            <Text fontSize="15px" fontWeight={700} color="var(--ink)">{s.title}</Text>
            <Text mt={1} fontSize="14px" lineHeight="1.65" color="var(--ink-2)">{s.body}</Text>
          </Box>
        ))}
      </Grid>
    </Box>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <Box {...panelProps} fontSize="14px" color="var(--ink-2)" lineHeight="1.7">{children}</Box>;
}

export default function LedgerPage() {
  const { runs, earnings, loading, error, retry } = useLedgerData();
  const deployed = Boolean(DEPLOYMENT.ledger);

  return (
    <Box>
      <div className="page-intro">
        <h1>Every payout is auditable.</h1>
        <p>
          The ledger stores each run's exact config, the model fingerprint after every round, and every exchange's contribution.
          Training is bit-for-bit deterministic, so your browser can re-run any committed run and check it.
        </p>
      </div>
      <Flex direction="column" gap={5} maxW="1080px">
        {!deployed && (
          <Notice>The ledger contract is being deployed to BSC testnet. Runs will appear here.</Notice>
        )}
        {error && (
          <Flex align="center" gap={3} fontSize="13px" color="#b4532a" wrap="wrap">
            <span className="connection-notice" style={{ margin: 0 }}>Could not reach BSC testnet right now.</span>
            <Button size="small" variant="outlined" onClick={retry}>Retry</Button>
          </Flex>
        )}
        {deployed && earnings.length > 0 && <EarningsPanel earnings={earnings} />}
        {deployed && loading && runs.length === 0 && !error && <Notice>Reading runs from the ledger…</Notice>}
        {deployed && !loading && !error && runs.length === 0 && <Notice>No runs have been committed yet. Train the consortium and commit one.</Notice>}
        {runs.map((run, i) => <RunCard key={run.runId} run={run} index={i} />)}
        <Explainer />
      </Flex>
    </Box>
  );
}
