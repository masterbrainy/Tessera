import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { Button, Chip, CircularProgress } from "@mui/material";
import { motion } from "framer-motion";
import { parseDataset, type Dataset, type RawDataset } from "../engine/data";
import { shapeOf, type RunConfig } from "../engine/federation";
import { predict } from "../engine/model";
import { DATA_URL } from "./useFederation";
import { pct } from "./palette";
import ScreenUpload from "./builder/ScreenUpload";

const TEST_SPLIT = 2;
const FALSE_ALARM_RATE = 0.01;
const FEATURE_GRID = 8;
const ILLICIT = 1;
const LICIT = 0;

const eyebrow = { fontSize: "11px", letterSpacing: ".12em", fontWeight: 700, color: "var(--muted)" } as const;
const panelProps = { p: 6, borderRadius: "16px", bg: "var(--panel)", border: "1px solid var(--line)" } as const;
const MotionBox = motion(Box);

/* ---------- dataset: fetched and parsed once ---------- */

let datasetPromise: Promise<Dataset> | null = null;
function loadDataset(): Promise<Dataset> {
  datasetPromise ??= fetch(DATA_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`dataset: HTTP ${r.status}`);
      return r.json() as Promise<RawDataset>;
    })
    .then(parseDataset)
    .catch((err: unknown) => {
      datasetPromise = null;
      throw err;
    });
  return datasetPromise;
}

/* ---------- scoring ---------- */

interface Scored {
  ds: Dataset;
  testRows: number[];
  /** Risk score per dataset row (NaN outside the test window). */
  score: Float64Array;
  threshold: number;
  illicitRows: number[];
  licitRows: number[];
}

/** Same rule as `recallAtFpr`: the score above which only `fpr` of licit test transactions fall. */
function alertThreshold(scores: number[], fpr: number): number {
  const sorted = [...scores].sort((a, b) => b - a);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(fpr * sorted.length))] : Number.NaN;
}

function scoreTestWindow(ds: Dataset, params: Float64Array, cfg: RunConfig): Scored {
  const testRows: number[] = [];
  for (let i = 0; i < ds.size; i++) if (ds.split[i] === TEST_SPLIT) testRows.push(i);
  const probs = predict(params, shapeOf(cfg, ds), ds, testRows);
  const tasks = ds.tasks.length;
  const score = new Float64Array(ds.size).fill(Number.NaN);
  const illicitRows: number[] = [];
  const licitRows: number[] = [];
  const licitScores: number[] = [];
  testRows.forEach((row, r) => {
    const p = probs[r * tasks];
    score[row] = p;
    const y = ds.labels[row * tasks];
    if (y === ILLICIT) illicitRows.push(row);
    else if (y === LICIT) {
      licitRows.push(row);
      licitScores.push(p);
    }
  });
  return { ds, testRows, score, threshold: alertThreshold(licitScores, FALSE_ALARM_RATE), illicitRows, licitRows };
}

interface Confusion {
  caught: number;
  missed: number;
  falseAlarms: number;
  cleared: number;
}

function confusion(s: Scored): Confusion {
  const caught = s.illicitRows.filter((row) => s.score[row] > s.threshold).length;
  const falseAlarms = s.licitRows.filter((row) => s.score[row] > s.threshold).length;
  return {
    caught,
    missed: s.illicitRows.length - caught,
    falseAlarms,
    cleared: s.licitRows.length - falseAlarms,
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; scored: Scored };

function useScored(params: Float64Array | null, cfg: RunConfig | null): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    if (!params || !cfg) return;
    let cancelled = false;
    setState({ status: "loading" });
    loadDataset()
      .then((ds) => new Promise<Scored>((resolve) => setTimeout(() => resolve(scoreTestWindow(ds, params, cfg)), 0)))
      .then((scored) => !cancelled && setState({ status: "ready", scored }))
      .catch((err: unknown) => !cancelled && setState({ status: "error", message: err instanceof Error ? err.message : String(err) }));
    return () => {
      cancelled = true;
    };
  }, [params, cfg]);
  return state;
}

/* ---------- presentational pieces ---------- */

const pickRandom = (rows: readonly number[]): number | null => (rows.length ? rows[Math.floor(Math.random() * rows.length)] : null);

function labelOf(ds: Dataset, row: number): number {
  return ds.labels[row * ds.tasks.length];
}

function Gauge({ score, threshold }: { score: number; threshold: number }) {
  return (
    <Box position="relative" mt={3} h="14px" borderRadius="7px" bg="var(--panel-2)" role="img" aria-label={`Risk ${pct(score)}, alert threshold ${pct(threshold)}`}>
      <Box h="100%" w={`${Math.max(1, 100 * score)}%`} borderRadius="7px" bg={score > threshold ? "var(--accent)" : "var(--green)"} transition="width .4s" />
      <Box position="absolute" top="-5px" bottom="-5px" left={`${100 * threshold}%`} w="2px" bg="var(--ink)" />
      <Text position="absolute" top="20px" left={`${100 * threshold}%`} transform="translateX(-50%)" fontSize="11px" color="var(--muted)" whiteSpace="nowrap">
        alert threshold {pct(threshold)}
      </Text>
    </Box>
  );
}

function FeatureHeatmap({ ds, row }: { ds: Dataset; row: number }) {
  const bits = ds.fp[row];
  return (
    <Box>
      <Grid templateColumns={`repeat(${FEATURE_GRID}, 1fr)`} gap="3px" maxW="200px">
        {Array.from(bits, (bit, f) => {
          const bin = bit % ds.nBins;
          const strength = bin / Math.max(1, ds.nBins - 1);
          return (
            <Box
              key={f}
              aspectRatio="1"
              borderRadius="3px"
              bg="var(--accent)"
              opacity={0.1 + 0.9 * strength}
              title={`${ds.features[f] ?? `feature ${f}`}: bin ${bin + 1} of ${ds.nBins}`}
            />
          );
        })}
      </Grid>
      <Text mt={2} fontSize="12px" color="var(--muted)" maxW="260px" lineHeight="1.5">
        64 anonymized transaction features (Elliptic). Darker = higher quantile
      </Text>
    </Box>
  );
}

function Verdict({ ds, scored, row }: { ds: Dataset; scored: Scored; row: number }) {
  const score = scored.score[row];
  const alert = score > scored.threshold;
  const label = labelOf(ds, row);
  const known = label === ILLICIT || label === LICIT;
  const correct = known && alert === (label === ILLICIT);
  return (
    <Grid templateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap={8} mt={6}>
      <Box>
        <Flex gap={2} wrap="wrap">
          <Chip size="small" variant="outlined" label={`Transaction ${ds.txId[row]}`} />
          <Chip size="small" variant="outlined" label={`Time step ${ds.step[row]}`} />
        </Flex>
        <Text mt={5} {...eyebrow}>RISK SCORE</Text>
        <Text fontSize="52px" lineHeight="1.1" fontWeight={800} color={alert ? "var(--accent)" : "var(--ink)"}>{pct(score)}</Text>
        <Box pb={6}><Gauge score={score} threshold={scored.threshold} /></Box>
        <Text mt={2} fontSize="18px" fontWeight={700} color={alert ? "var(--accent)" : "var(--green)"}>
          {alert ? "Alert: route to compliance" : "Clear"}
        </Text>
        <Text mt={2} fontSize="14px" color="var(--ink-2)" lineHeight="1.6">
          Elliptic ground truth: <strong>{known ? (label === ILLICIT ? "illicit" : "licit") : "unlabeled"}</strong>
          {known && (
            <Text as="span" fontWeight={700} color={correct ? "var(--green)" : "#b4532a"}>
              {correct ? " ✓ the model was right" : " ✗ the model was wrong"}
            </Text>
          )}
        </Text>
      </Box>
      <FeatureHeatmap ds={ds} row={row} />
    </Grid>
  );
}

function ScreenOne({ scored }: { scored: Scored }) {
  const [row, setRow] = useState<number | null>(null);
  const all = useMemo(() => [...scored.illicitRows, ...scored.licitRows], [scored]);
  const buttons: { label: string; rows: readonly number[] }[] = [
    { label: "Random transaction", rows: all },
    { label: "Random illicit", rows: scored.illicitRows },
    { label: "Random licit", rows: scored.licitRows },
  ];
  return (
    <MotionBox {...panelProps} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Text {...eyebrow}>SCREEN A TRANSACTION</Text>
      <Text mt={2} fontSize="14px" lineHeight="1.7" color="var(--ink-2)">
        Pick a transaction from the future window (time steps 35–49). No exchange trained on it.
      </Text>
      <Flex mt={4} gap={3} wrap="wrap">
        {buttons.map((b, i) => (
          <Button key={b.label} variant={i === 0 ? "contained" : "outlined"} disableElevation onClick={() => setRow(pickRandom(b.rows))}>
            {b.label}
          </Button>
        ))}
      </Flex>
      {row !== null && <Verdict ds={scored.ds} scored={scored} row={row} />}
    </MotionBox>
  );
}

function Cell({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" }) {
  return (
    <Box p={4} borderRadius="14px" bg={tone === "good" ? "var(--green-soft)" : "var(--accent-soft)"} border="1px solid var(--line)">
      <Text fontSize="26px" fontWeight={800} color="var(--ink)">{value.toLocaleString()}</Text>
      <Text fontSize="13px" color="var(--ink-2)">{label}</Text>
    </Box>
  );
}

function ScreenWindow({ scored }: { scored: Scored }) {
  const [result, setResult] = useState<Confusion | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(() => {
    setBusy(true);
    setTimeout(() => {
      setResult(confusion(scored));
      setBusy(false);
    }, 0);
  }, [scored]);

  const illicit = scored.illicitRows.length;
  const licit = scored.licitRows.length;
  return (
    <MotionBox {...panelProps} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <Text {...eyebrow}>SCREEN THE WHOLE FUTURE WINDOW</Text>
      <Text mt={2} fontSize="14px" lineHeight="1.7" color="var(--ink-2)">
        Score every labeled transaction in time steps 35–49 at the threshold that allows 1% false alarms.
      </Text>
      <Flex mt={4} align="center" gap={3}>
        <Button variant="contained" disableElevation onClick={run} disabled={busy}>
          {result ? "Screen again" : `Screen all ${(illicit + licit).toLocaleString()} transactions`}
        </Button>
        {busy && <CircularProgress size={20} sx={{ color: "var(--accent)" }} />}
      </Flex>
      {result && (
        <Box mt={6}>
          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3} maxW="520px">
            <Cell label="Illicit, caught" value={result.caught} tone="good" />
            <Cell label="Illicit, missed" value={result.missed} tone="bad" />
            <Cell label="Licit, false alarms" value={result.falseAlarms} tone="bad" />
            <Cell label="Licit, cleared" value={result.cleared} tone="good" />
          </Grid>
          <Text mt={5} {...eyebrow}>CATCH RATE</Text>
          <Text fontSize="34px" fontWeight={800} color="var(--ink)">{pct(illicit ? result.caught / illicit : Number.NaN)}</Text>
          <Text mt={2} fontSize="15px" lineHeight="1.7" color="var(--ink-2)" maxW="680px">
            Out of {illicit.toLocaleString()} illicit transactions in weeks the model never saw, it flagged {result.caught.toLocaleString()} while
            bothering compliance with only {result.falseAlarms.toLocaleString()} false alarms out of {licit.toLocaleString()} licit ones.
          </Text>
        </Box>
      )}
    </MotionBox>
  );
}

/* ---------- page ---------- */

interface ScorePageProps {
  params: Float64Array | null;
  cfg: RunConfig | null;
  onRunFirst: () => void;
}

function EmptyState({ onRunFirst }: { onRunFirst: () => void }) {
  return (
    <Box {...panelProps} maxW="720px">
      <Text fontSize="18px" fontWeight={700} color="var(--ink)">Train a model in the data market first</Text>
      <Text mt={2} mb={5} fontSize="15px" lineHeight="1.7" color="var(--ink-2)">
        This page screens transactions with the model your exchanges just trained together. Run the consortium once and come back here to try it on weeks of data it has never seen.
      </Text>
      <Button variant="contained" disableElevation onClick={onRunFirst}>Go to the data market</Button>
    </Box>
  );
}

export default function ScorePage({ params, cfg, onRunFirst }: ScorePageProps) {
  const state = useScored(params, cfg);
  const hasModel = params !== null && cfg !== null;

  return (
    <Box>
      <div className="page-intro">
        <h1>Put the trained model to work.</h1>
        <p>
          The model the contributors paid into now protects them: screen your own transactions with it, or explore how it flags suspicious flow in time steps 35–49, a future window no one trained on. Alerts fire at a threshold where only 1% of licit transactions raise a false alarm.
        </p>
      </div>
      {!hasModel && <EmptyState onRunFirst={onRunFirst} />}
      {hasModel && state.status === "loading" && (
        <Flex align="center" gap={3} color="var(--muted)" fontSize="14px">
          <CircularProgress size={20} sx={{ color: "var(--accent)" }} /> Loading the dataset and scoring the future window…
        </Flex>
      )}
      {hasModel && state.status === "error" && (
        <Box {...panelProps} color="#b4532a" fontSize="14px">Could not score the test window: {state.message}</Box>
      )}
      {hasModel && state.status === "ready" && (
        <Flex direction="column" gap={5} maxW="1080px">
          <ScreenUpload params={params!} cfg={cfg!} threshold={state.scored.threshold} />
          <ScreenOne scored={state.scored} />
          <ScreenWindow scored={state.scored} />
        </Flex>
      )}
    </Box>
  );
}
