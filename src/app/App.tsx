import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Button } from "@mui/material";
import { EXCHANGES } from "../engine/data";
import { DEFAULT_CONFIG, type RunConfig } from "../engine/federation";
import TopBar, { type View } from "./TopBar";
import Garden from "./Garden.jsx";
import ActivityBar from "./Activity";
import NowCard from "./NowCard";
import ScenarioPanel from "./ScenarioPanel";
import Results from "./Results";
import CommitCard from "./CommitCard";
import ExchangeDialog from "./ExchangeDialog";
import HowItWorks from "./HowItWorks";
import LedgerPage from "./LedgerPage";
import ScorePage from "./ScorePage";
import { useFederation, type FedState } from "./useFederation";
import { colorOf, pct } from "./palette";

/** Best final catch rate any honest exchange reached on its own, or null while baselines are still training. */
function bestSolo(state: FedState): number | null {
  const attackers = new Set(state.cfg.attacks.map((a) => a.lab));
  const finals = Object.entries(state.solo)
    .filter(([lab, c]) => !attackers.has(Number(lab)) && c.length === state.cfg.rounds)
    .map(([, c]) => c[c.length - 1].catchRate);
  return finals.length ? Math.max(...finals) : null;
}

function intro(state: FedState) {
  const last = state.rounds.at(-1);
  const n = state.cfg.numLabs;
  if (state.status === "done" && last) {
    const best = bestSolo(state);
    if (best !== null && last.test.catchRate < best) {
      return {
        h: `Without a defense, one malicious exchange dragged the shared model down to ${pct(last.test.catchRate)}.`,
        p: `Every honest exchange does better on its own (best: ${pct(best)}). Switch the coordinator defense back to "Screen + trimmed mean" and run again.`,
      };
    }
    return {
      h: `Together, ${n} exchanges catch ${pct(last.test.catchRate)} of illicit transactions without sharing a single one.`,
      p: "Scroll down for how that compares with each exchange alone, who got paid what, and to settle the run onchain.",
    };
  }
  if ((state.status === "running" || state.status === "loading") && state.cfg) {
    return {
      h: last ? `Round ${state.round + 1} of ${state.cfg.rounds}: the shared model catches ${pct(last.test.catchRate)} of illicit transactions` : `${n} exchanges are joining the consortium…`,
      p: "Watch the weight updates travel. Transactions never leave their exchange; a malicious member's update gets stopped at the coordinator.",
    };
  }
  return {
    h: "Crypto exchanges train one anti-money-laundering model together, without sharing customer data.",
    p: "Each exchange only sees part of the illicit flow. Tessera lets them pool what they learn instead of what they hold, prices every member's contribution exactly, and settles payouts onchain. Real data: 46,564 labeled Bitcoin transactions (Elliptic).",
  };
}

function useFlowers(state: FedState) {
  return useMemo(() => {
    const cfg = state.cfg;
    const attackers = new Set(cfg.attacks.map((a) => a.lab));
    const contribution = Array.from({ length: cfg.numLabs }, (_, i) => state.rounds.reduce((a, r) => a + Math.max(0, r.labs[i]?.shapley ?? 0), 0));
    const total = contribution.reduce((a, b) => a + b, 0);
    const last = state.rounds.at(-1);
    return Array.from({ length: cfg.numLabs }, (_, lab) => {
      const info = state.labs[lab];
      const attacker = attackers.has(lab);
      const rejectedRounds = state.rounds.filter((r) => r.labs[lab] && !r.labs[lab].accepted).length;
      const share = total > 0 ? contribution[lab] / total : 0;
      const rejected = !!last && !!last.labs[lab] && !last.labs[lab].accepted;
      return {
        lab,
        name: EXCHANGES[lab].name,
        kind: EXCHANGES[lab].kind,
        n: info?.n ?? 0,
        attacker,
        rejected,
        color: colorOf(lab, attacker),
        scale: state.rounds.length ? 0.78 + Math.min(1, share * cfg.numLabs) * 0.32 + share * 0.4 : 1,
        status: rejectedRounds ? `✕ rejected ${rejectedRounds}/${state.rounds.length}` : state.rounds.length ? `${pct(share)} of rewards` : attacker ? "will attack" : "",
        statusColor: rejectedRounds ? "#c2410c" : attacker ? "#c2410c" : "var(--green)",
      };
    });
  }, [state.cfg, state.labs, state.rounds]);
}

export default function App() {
  const { state, start, stop } = useFederation();
  const [cfg, setCfg] = useState<RunConfig>(DEFAULT_CONFIG);
  const [view, setView] = useState<View>("consortium");
  const [howOpen, setHowOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const flowers = useFlowers(state.status === "idle" ? { ...state, cfg } : state);
  const busy = state.status === "running" || state.status === "loading";
  const text = intro(state);

  useEffect(() => {
    if (state.status === "done") document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.status]);

  const run = () => {
    setView("consortium");
    void start(cfg);
  };
  const toResults = () => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
  const attacker = cfg.attacks[0] ? EXCHANGES[cfg.attacks[0].lab].name : null;
  const totalTx = state.labs.reduce((a, l) => a + l.n, 0);

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <TopBar view={view} onView={setView} onHow={() => setHowOpen(true)} />
        <main id="main">
          {view === "consortium" && (
            <>
              <section className="page-intro">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={text.h} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <h1>{text.h}</h1>
                    <p>{text.p}</p>
                  </motion.div>
                </AnimatePresence>
              </section>
              <div className="workspace-grid">
                <section className="garden-panel" aria-label="Consortium">
                  <span className="team-count">
                    {state.cfg.numLabs} exchanges{totalTx ? ` · ${totalTx.toLocaleString()} private transactions` : ""} · 1 coordinator
                  </span>
                  <div className="garden-canvas">
                    <Garden flowers={flowers} event={state.event} onPick={setPicked}
                      caption={busy ? `round ${state.round + 1} of ${state.cfg.rounds}` : "sees weights, never transactions"} />
                  </div>
                  <div className="legend" aria-label="Legend">
                    <span><i style={{ background: "#e8799a" }} />Exchange (bigger = more rewards)</span>
                    <span><i style={{ background: "#a08a78" }} />Malicious exchange</span>
                    <span><i style={{ background: "var(--hub)" }} />Model weights in transit</span>
                    <span><i style={{ background: "#c2410c" }} />Rejected update</span>
                  </div>
                </section>
                <aside className="activity-column" aria-label="Controls and activity">
                  {busy ? (
                    <motion.button className="continue-btn secondary" onClick={stop} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      Stop run
                      <span>Round {state.round + 1} of {state.cfg.rounds}</span>
                    </motion.button>
                  ) : (
                    <motion.button className="continue-btn" onClick={run} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      {state.status === "done" ? "Run again →" : "Run the consortium →"}
                      <span>{cfg.numLabs} exchanges · {cfg.rounds} rounds · {attacker ? `${attacker} attacks` : "everyone honest"}</span>
                    </motion.button>
                  )}
                  <ActivityBar activity={state.activity} />
                  <NowCard state={state} onResults={toResults} />
                  <div style={{ height: 16 }} />
                  <ScenarioPanel cfg={cfg} onChange={setCfg} disabled={busy} />
                </aside>
              </div>
              <Results state={state} onPick={setPicked}
                commit={<CommitCard state={state} onLedger={() => setView("ledger")} />} />
              {state.status === "done" && (
                <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
                  <Button variant="outlined" onClick={() => setView("screen")} sx={{ textTransform: "none" }}>
                    Use the consortium model to screen a transaction →
                  </Button>
                </div>
              )}
            </>
          )}
          {view === "ledger" && <LedgerPage />}
          {view === "screen" && (
            <ScorePage params={state.summary?.params ?? null} cfg={state.summary ? state.cfg : null} onRunFirst={run} />
          )}
        </main>
        <footer className="site-footer">
          Built at B@BHacks 2.0 · Elliptic dataset (real, anonymized Bitcoin transactions) · contracts on BSC testnet ·{" "}
          <a href="https://github.com/masterbrainy/Tessera" target="_blank" rel="noreferrer">source</a>
        </footer>
        <ExchangeDialog lab={picked} state={state} onClose={() => setPicked(null)} />
        <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
      </div>
    </MotionConfig>
  );
}
