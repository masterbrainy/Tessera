import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import LockIcon from "@mui/icons-material/Lock";
import { PALETTES, paletteOf } from "./palette";

// Ported from bloom's garden: each exchange is a blossom on a golden-angle spiral around the
// coordinator (a sunflower). Model weights travel the vines as pulses; raw transactions never do.
const W = 1200, H = 780, CX = W / 2, CY = H / 2 + 6;
const FLOWER_SCALE = 1.8;
const BACK = [0.34, 1.56, 0.64, 1]; // easeOutBack: the petals overshoot a little, like a real bloom
const PULSE_MS = 1300;
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// One petal pointing up from the centre, with a small notch at the tip (cherry-blossom shape).
const PETAL = "M0,0 C-9,-4 -15,-17 -11,-27 C-8,-33 -3,-33 0,-29 C3,-33 8,-33 11,-27 C15,-17 9,-4 0,0 Z";

export function slot(k, cx = CX, cy = CY, c = 96, sx = 1.55, sy = 0.9) {
  const r = c * Math.sqrt(k + 2.4); // start one ring out so the first flower clears the hub
  const a = k * GOLDEN_ANGLE - Math.PI / 2;
  return { x: cx + sx * r * Math.cos(a), y: cy + sy * r * Math.sin(a) };
}

function Defs() {
  return (
    <defs>
      {Object.entries(PALETTES).map(([k, [deep, mid, light]]) => (
        <radialGradient key={k} id={`petal-${k}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="32">
          <stop offset="0" stopColor={deep} />
          <stop offset="0.4" stopColor={mid} />
          <stop offset="1" stopColor={light} />
        </radialGradient>
      ))}
      <radialGradient id="sun-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fcd34d" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fcd34d" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="petal-sun" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="32">
        <stop offset="0" stopColor="#d97706" />
        <stop offset="0.45" stopColor="#fbbf24" />
        <stop offset="1" stopColor="#fde68a" />
      </radialGradient>
      <radialGradient id="seed-disc" cx="0.45" cy="0.4" r="0.6">
        <stop offset="0" stopColor="#8a5a1c" />
        <stop offset="1" stopColor="#4a2c0c" />
      </radialGradient>
      <radialGradient id="stamen" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#a16207" />
        <stop offset="1" stopColor="#facc15" />
      </radialGradient>
    </defs>
  );
}

export function Petals({ pal, T, back, wilt }) {
  const n = 5;
  return Array.from({ length: n }, (_, i) => (
    <g key={i} transform={`rotate(${i * (360 / n) + (back ? 36 : 0)}) scale(${back ? 0.88 : 1})`}>
      <motion.g
        style={{ originX: 0.5, originY: 1 }}
        initial={{ scale: 0 }}
        animate={wilt ? { scale: 0.72, rotate: back ? -18 : 22, opacity: 0.55 } : { scale: 1, rotate: 0, opacity: 1 }}
        transition={wilt ? { duration: 0.8, ease: [0.4, 0, 0.2, 1] } : { delay: T * (back ? 0.25 : 0.42) + i * 0.06, duration: T * 0.45, ease: BACK }}
      >
        <path d={PETAL} fill={`url(#petal-${pal})`} stroke={PALETTES[pal][0]} strokeOpacity={0.45} strokeWidth={0.7} opacity={back ? 0.75 : 1} />
        {!back && <path d="M0,-4 C-1,-12 1,-18 0,-24" fill="none" stroke={PALETTES[pal][0]} strokeOpacity={0.3} strokeWidth={0.7} />}
      </motion.g>
    </g>
  ));
}

export function Stamen({ T }) {
  return (
    <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: T * 0.7, duration: 0.5, ease: BACK }}>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i * 36 * Math.PI) / 180, r = i % 2 ? 9 : 10.5;
        return (
          <g key={i}>
            <line x1={0} y1={0} x2={Math.cos(a) * r} y2={Math.sin(a) * r} stroke="#c98a12" strokeWidth={0.6} strokeOpacity={0.7} />
            <circle cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={1.1} fill="#e8a317" />
          </g>
        );
      })}
      <circle r={4.5} fill="url(#stamen)" />
    </motion.g>
  );
}

/** A blossom on its own, for dialogs and legends. */
export function Blossom({ pal, size = 96, T = 0.9, wilt = false }) {
  return (
    <svg viewBox="-40 -40 80 80" width={size} height={size} style={{ flexShrink: 0, overflow: "visible" }}>
      <Defs />
      <g className="spin blossom" style={{ animationDuration: "40s" }}>
        <Petals pal={pal} T={T} back wilt={wilt} />
        <Petals pal={pal} T={T} wilt={wilt} />
      </g>
      <Stamen T={T} />
    </svg>
  );
}

function Label({ f, place }) {
  const side = place === "left" || place === "right";
  const x = side ? (place === "left" ? -38 : 38) : 0;
  const y = place === "above" ? -56 : place === "below" ? 44 : -6;
  const anchor = place === "left" ? "end" : place === "right" ? "start" : "middle";
  return (
    <>
      <text x={x} y={y} textAnchor={anchor} fontSize={11.5} fontWeight={650} fill="var(--ink)">{f.name}</text>
      <text x={x} y={y + 12} textAnchor={anchor} fontSize={8.5} fill="var(--muted)">{f.kind}{f.n ? ` · ${f.n.toLocaleString()} private tx` : ""}</text>
      {f.status && (
        <text x={x} y={y + 24} textAnchor={anchor} fontSize={8.5} fontWeight={650} fill={f.statusColor}>{f.status}</text>
      )}
    </>
  );
}

function Flower({ f, x, y, index, active, place, onPick }) {
  const T = 1.6;
  const pal = paletteOf(f.lab, f.attacker);
  return (
    <g transform={`translate(${x},${y}) scale(${FLOWER_SCALE})`} className="flower-hit" onClick={onPick}
      role="button" tabIndex={0} aria-label={`About ${f.name}`} onKeyDown={(e) => e.key === "Enter" && onPick()}>
      <circle r={38} fill="transparent" />
      <motion.circle r={24} fill="none" stroke={PALETTES[pal][1]} strokeWidth={1}
        initial={{ scale: 0.6, opacity: 0.8 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ delay: T * 0.9, duration: 1.2, ease: "easeOut" }} />
      <AnimatePresence>
        {active && (
          <motion.circle key="glow" className="pulse" r={36} fill={f.rejected ? "#c2410c" : PALETTES[pal][1]} fillOpacity={0.2}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        )}
      </AnimatePresence>
      <motion.g animate={{ scale: f.scale }} transition={{ duration: 0.9, ease: BACK }}>
        <g className={f.rejected ? undefined : "sway"} style={{ animationDuration: `${5 + (index % 3)}s`, animationDelay: `-${index * 0.7}s` }}>
          <g className="spin blossom" style={{ animationDuration: `${80 + (index % 4) * 10}s`, animationDirection: index % 2 ? "reverse" : "normal" }}>
            <g className="bloom-pulse" style={{ animationDelay: `-${(index * 0.9) % 3.2}s` }}>
              <Petals pal={pal} T={T} back wilt={f.rejected} />
              <Petals pal={pal} T={T} wilt={f.rejected} />
            </g>
          </g>
          <Stamen T={T} />
        </g>
      </motion.g>
      {/* the private data never leaves: a small vault badge under each blossom */}
      <g transform="translate(15,13)">
        <circle r={6.5} fill="var(--panel)" stroke="var(--line)" strokeWidth={0.8} />
        <LockIcon x={-4} y={-4} width={8} height={8} style={{ color: "var(--muted)" }} />
      </g>
      {f.rejected && (
        <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, ease: BACK }}>
          <circle r={27} fill="none" stroke="#c2410c" strokeWidth={1.4} strokeDasharray="3 3" />
        </motion.g>
      )}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: T * 0.8, duration: 0.5 }}>
        <Label f={f} place={place} />
      </motion.g>
    </g>
  );
}

// The coordinator: a sunflower whose seeds sit on the same golden-angle spiral the exchanges grow on.
function Hub({ pulse, caption }) {
  const ring = (n, back) => Array.from({ length: n }, (_, i) => (
    <g key={`${back ? "b" : "f"}${i}`} transform={`rotate(${(360 / n) * i + (back ? 180 / n : 0)}) translate(0,-13) scale(${back ? 0.5 : 0.46},${back ? 0.95 : 0.85})`}>
      <path d={PETAL} fill="url(#petal-sun)" stroke="#b45309" strokeOpacity={0.35} strokeWidth={0.9} opacity={back ? 0.8 : 1} />
      {!back && <path d="M0,-4 C-1,-12 1,-18 0,-24" fill="none" stroke="#b45309" strokeOpacity={0.25} strokeWidth={0.9} />}
    </g>
  ));
  return (
    <g transform={`translate(${CX},${CY}) scale(1.75)`}>
      <circle className="sun-glow" r={50} fill="url(#sun-glow)" />
      <AnimatePresence>
        {pulse && (
          <motion.circle key={pulse} r={24} fill="none" stroke="var(--hub)" strokeWidth={1.2}
            initial={{ scale: 0.9, opacity: 0.9 }} animate={{ scale: 2.4, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }} />
        )}
      </AnimatePresence>
      <g className="spin blossom" style={{ animationDuration: "120s" }}>
        <g className="bloom-pulse" style={{ animationDuration: "4.5s" }}>
          {ring(16, true)}
          {ring(16, false)}
        </g>
      </g>
      <circle r={14} fill="url(#seed-disc)" />
      {Array.from({ length: 70 }, (_, i) => {
        const r = 1.55 * Math.sqrt(i + 0.5), a = i * GOLDEN_ANGLE;
        return <circle key={i} cx={r * Math.cos(a)} cy={r * Math.sin(a)} r={0.75} fill="#d9a441" opacity={0.55 + (i % 3) * 0.12} />;
      })}
      <text y={60} textAnchor="middle" fontSize={11} fontWeight={650} fill="var(--ink)">Coordinator</text>
      <text y={71} textAnchor="middle" fontSize={7.5} fill="var(--muted)">{caption}</text>
    </g>
  );
}

// A weight update travelling a vine. Rejected updates stop short of the hub and burst.
function Pulse({ p, from, to }) {
  const [a, b] = p.out ? [from, to] : [to, from];
  const stop = p.rejected ? { x: a.x + (b.x - a.x) * 0.62, y: a.y + (b.y - a.y) * 0.62 } : b;
  return (
    <g>
      <motion.circle r={p.out ? 6 : 7} fill={p.rejected ? "#c2410c" : p.out ? "var(--hub)" : p.color} stroke="#fffdf9" strokeWidth={1.5}
        initial={{ cx: a.x, cy: a.y, opacity: 0 }}
        animate={{ cx: [a.x, stop.x], cy: [a.y, stop.y], opacity: p.rejected ? [0, 1, 1, 0] : [0, 1, 1, 0] }}
        transition={{ duration: p.rejected ? 1.0 : 1.2, ease: "easeInOut" }} />
      {p.rejected && (
        <motion.text x={stop.x} y={stop.y + 5} textAnchor="middle" fontSize={18} fontWeight={800} fill="#c2410c"
          initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1, 1] }} transition={{ delay: 0.8, duration: 1.2 }}>
          ✕
        </motion.text>
      )}
    </g>
  );
}

function labelPlace({ x, y }) {
  const dx = x - CX, dy = y - CY;
  if (Math.abs(dx) * 0.55 > Math.abs(dy) && Math.abs(dx) < 340) return dx < 0 ? "left" : "right";
  return dy < 0 ? "above" : "below";
}

/**
 * flowers: [{ lab, name, kind, n, attacker, rejected, scale, status, statusColor, color }]
 * event:   { id, kind: "broadcast" | "updates", rejected: number[] } from useFederation
 */
export default function Garden({ flowers, event, caption, onPick }) {
  const positions = useMemo(() => flowers.map((_, k) => slot(k)), [flowers.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pulses, setPulses] = useState([]);
  const [active, setActive] = useState({});
  const [hubPulse, setHubPulse] = useState(null);

  useEffect(() => {
    if (!event) return;
    const add = flowers.map((f, k) => ({
      uid: `${event.id}-${k}`, k, out: event.kind === "broadcast", color: f.color,
      rejected: event.kind === "updates" && event.rejected.includes(f.lab),
    }));
    setPulses((ps) => [...ps, ...add].slice(-24));
    setActive((a) => ({ ...a, ...Object.fromEntries(flowers.map((f) => [f.lab, Date.now()])) }));
    if (event.kind === "updates") setTimeout(() => setHubPulse(`h${event.id}`), 1000);
    const t = setTimeout(() => {
      setPulses((ps) => ps.filter((p) => !add.includes(p)));
      setActive((a) => Object.fromEntries(Object.entries(a).filter(([, ts]) => Date.now() - ts < PULSE_MS)));
    }, PULSE_MS + 900);
    return () => clearTimeout(t);
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: "block" }}>
      <Defs />
      {flowers.map((f, k) => (
        <motion.line key={`e-${f.lab}`} x1={CX} y1={CY} x2={positions[k].x} y2={positions[k].y}
          stroke={f.rejected ? "#e9b9a3" : active[f.lab] ? "var(--hub)" : "var(--vine)"} strokeWidth={active[f.lab] ? 2.5 : 1.5}
          strokeDasharray={f.rejected ? "6 6" : undefined}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: "easeOut" }} />
      ))}
      {pulses.map((p) => positions[p.k] && <Pulse key={p.uid} p={p} from={{ x: CX, y: CY }} to={positions[p.k]} />)}
      <Hub pulse={hubPulse} caption={caption} />
      {flowers.map((f, k) => (
        <Flower key={f.lab} f={f} x={positions[k].x} y={positions[k].y} index={k} active={!!active[f.lab]}
          place={labelPlace(positions[k])} onPick={() => onPick?.(f.lab)} />
      ))}
    </svg>
  );
}
