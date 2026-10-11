import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Button, Chip, Slider } from "@mui/material";
import Add from "@mui/icons-material/Add";
import Garden from "../Garden.jsx";
import { colorOf, pct } from "../palette";
import ExchangeEditor from "./ExchangeEditor";
import BuilderResults, { POOL_AUSD, rejectedRounds } from "./BuilderResults";
import { MAX_EXCHANGES, statsOf, useBuilder, type Exchange } from "./useBuilder";
import type { Snapshot } from "./runConsortium";
import Markets from "./Markets";
import PayoutPanel from "./PayoutPanel";

const QUALITY_CHIP = {
  clean: null,
  noisy: { label: "noisy labels", color: "#b7791f" },
  compromised: { label: "compromised", color: "#c2410c" },
} as const;

function intro(snap: Snapshot, n: number) {
  const last = snap.results.at(-1);
  if (snap.phase === "done" && last) {
    const cut = snap.members.filter((_, lab) => rejectedRounds(snap, lab) > 0).map((m) => m.name);
    return {
      h: `${snap.members.length} exchanges got paid for their data, and built a model that catches ${pct(last.catchRate)} of illicit transactions. No one shared a record.`,
      p: cut.length
        ? `${cut.join(" and ")} had bad data: the coordinator rejected ${cut.length > 1 ? "their updates" : "its updates"} and ${cut.length > 1 ? "they earn" : "it earns"} nothing. The other exchanges split the ${POOL_AUSD.toLocaleString()} AUSD pool by contribution.`
        : `Every exchange's data helped, so all of them share the ${POOL_AUSD.toLocaleString()} AUSD pool, in proportion to what each one added. Scroll down for the numbers.`,
    };
  }
  if (snap.phase === "training") {
    return {
      h: last ? `Round ${snap.results.length} of ${snap.totalRounds}: the shared model catches ${pct(last.catchRate)} of illicit transactions` : "Each exchange is loading its data into a private worker…",
      p: snap.status,
    };
  }
  return {
    h: "Get paid for what your private data is worth, without ever sharing it.",
    p: `Companies contribute private data to train a shared model. The data never leaves them, only model updates do. Each contributor is paid by exactly how much its data improved the model; bad data is caught and earns nothing. The trained model then goes back to work for its members. Live market: anti-money-laundering. Add exchanges, give each its transaction history (generate it or upload a CSV), and run.${n ? ` ${n} contributors so far.` : ""}`,
  };
}

function flowersOf(exchanges: Exchange[], snap: Snapshot) {
  const inRun = snap.phase !== "idle" && snap.members.length > 0;
  const contribution = snap.members.map((_, lab) => snap.results.reduce((a, r) => a + Math.max(0, r.labs[lab]?.shapley ?? 0), 0));
  const total = contribution.reduce((a, b) => a + b, 0);
  const last = snap.results.at(-1);
  const list = inRun ? snap.members.map((m) => ({ id: m.id, name: m.name, kind: m.kind, n: m.n })) : exchanges.map((e) => ({ id: e.id, name: e.name, kind: e.kind, n: statsOf(e.data).labeled }));
  return list.map((m, lab) => {
    const rej = inRun ? rejectedRounds(snap, lab) : 0;
    const share = inRun && total > 0 ? contribution[lab] / total : 0;
    return {
      lab,
      id: m.id,
      name: m.name,
      kind: m.kind,
      n: m.n,
      attacker: rej > 0,
      rejected: !!last?.labs[lab] && !last.labs[lab].accepted,
      color: colorOf(lab, rej > 0),
      scale: snap.results.length ? 0.78 + Math.min(1, share * list.length) * 0.32 + share * 0.4 : 1,
      status: rej ? `✕ rejected ${rej}/${snap.results.length}` : snap.results.length ? `${pct(share)} of rewards` : `${m.n.toLocaleString()} tx`,
      statusColor: rej ? "#c2410c" : "var(--green)",
    };
  });
}

export default function BuilderPage({ onModel }: { onModel: (params: Float64Array | null) => void }) {
  const b = useBuilder();
  const [editing, setEditing] = useState<string | null>(null);
  const [rounds, setRounds] = useState(12);
  const busy = b.snap.phase === "training";
  const flowers = useMemo(() => flowersOf(b.exchanges, b.snap), [b.exchanges, b.snap]);
  const text = intro(b.snap, b.exchanges.length);
  const ready = b.exchanges.filter((e) => e.data).length;

  useEffect(() => onModel(b.params), [b.params, onModel]);
  useEffect(() => {
    if (b.snap.phase === "done") document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [b.snap.phase]);

  const pick = (lab: number) => {
    const f = flowers[lab];
    if (f && b.exchanges.some((e) => e.id === f.id)) setEditing(f.id);
  };

  return (
    <>
      <section className="page-intro">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={text.h} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <h1>{text.h}</h1>
            <p>{text.p}</p>
          </motion.div>
        </AnimatePresence>
      </section>
      {b.snap.phase === "idle" && <Markets />}
      <div className="workspace-grid">
        <section className="garden-panel" aria-label="Your consortium">
          <span className="team-count">
            {flowers.length} exchanges · {flowers.reduce((a, f) => a + f.n, 0).toLocaleString()} private transactions · 1 coordinator · click an exchange to edit its data
          </span>
          <div className="garden-canvas">
            {b.loadError ? <Text color="#c2410c" p={6}>{b.loadError}</Text> : (
              <Garden flowers={flowers} event={b.snap.event} onPick={pick}
                caption={busy ? `round ${b.snap.results.length + 1} of ${b.snap.totalRounds}` : "sees weights, never transactions"} />
            )}
          </div>
          <div className="legend" aria-label="Legend">
            <span><i style={{ background: "#e8799a" }} />Exchange (bigger = more rewards)</span>
            <span><i style={{ background: "var(--hub)" }} />Model weights in transit</span>
            <span><i style={{ background: "#c2410c" }} />Rejected update</span>
            <span><i style={{ background: "#a08a78" }} />Caught with bad data</span>
          </div>
        </section>
        <aside className="activity-column" aria-label="Exchanges and controls">
          {busy ? (
            <motion.button className="continue-btn secondary" onClick={b.stop} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              Stop run
              <span>{b.snap.status}</span>
            </motion.button>
          ) : (
            <motion.button className="continue-btn" disabled={ready < 2 || !b.ds} onClick={() => void b.run(rounds)}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              {b.snap.phase === "done" ? "Run the market again →" : "Train and pay out →"}
              <span>{ready < 2 ? "Add at least two exchanges with data" : `${ready} contributors · ${rounds} rounds · ${POOL_AUSD.toLocaleString()} AUSD to split`}</span>
            </motion.button>
          )}
          {b.snap.error && <Text fontSize="12px" color="#c2410c" mb={3}>{b.snap.error}</Text>}

          <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--muted)" mb={2}>DATA CONTRIBUTORS</Text>
          {b.exchanges.map((e, k) => {
            const st = statsOf(e.data);
            const q = QUALITY_CHIP[e.quality];
            return (
              <Flex key={e.id} as="button" w="100%" textAlign="left" align="center" gap={3} p={3} mb={2} borderRadius="12px" bg="var(--panel)"
                border="1px solid" borderColor={q ? q.color : "var(--line)"} onClick={() => setEditing(e.id)} _hover={{ bg: "rgba(43,33,24,.03)" }}>
                <Box w="10px" h="10px" borderRadius="50%" bg={colorOf(k)} flexShrink={0} />
                <Box flex={1} minW={0}>
                  <Text fontSize="14px" fontWeight={650}>{e.name || "Unnamed exchange"}</Text>
                  <Text fontSize="11px" color="var(--muted)">
                    {e.kind} · {e.data ? `${st.labeled.toLocaleString()} tx · ${pct(st.illicit / Math.max(1, st.labeled))} illicit · ${e.data.source}` : "no data yet"}
                  </Text>
                </Box>
                {q && <Chip size="small" label={q.label} sx={{ fontSize: 10, height: 20, bgcolor: "transparent", border: `1px solid ${q.color}`, color: q.color }} />}
                <Text fontSize="12px" color="var(--accent)">Edit</Text>
              </Flex>
            );
          })}
          <Button fullWidth startIcon={<Add />} disabled={busy || !b.ds || b.exchanges.length >= MAX_EXCHANGES}
            onClick={() => {
              const id = b.add();
              if (id) setEditing(id);
            }}
            sx={{ textTransform: "none", borderRadius: "12px", border: "1px dashed var(--line)", color: "var(--ink-2)", py: 1.2 }}>
            Add an exchange
          </Button>

          <Box mt={4} p={4} borderRadius="14px" bg="var(--panel)" border="1px solid var(--line)">
            <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--muted)">TRAINING ROUNDS: {rounds}</Text>
            <Slider size="small" min={4} max={20} value={rounds} disabled={busy} onChange={(_, v) => setRounds(v as number)} />
            <Text fontSize="12px" color="var(--muted)" lineHeight={1.6}>
              Try it: open an exchange, set its data quality to <b>Compromised</b>, and run. Its updates get rejected and it earns 0;
              the others split the pool.
            </Text>
          </Box>
        </aside>
      </div>
      <BuilderResults snap={b.snap} />
      <PayoutPanel snap={b.snap} exchanges={b.exchanges} params={b.params} />
      <ExchangeEditor ex={b.exchanges.find((e) => e.id === editing) ?? null} locked={busy} onClose={() => setEditing(null)}
        onUpdate={b.update} onRegenerate={b.regenerate} onRemove={b.remove} />
    </>
  );
}
