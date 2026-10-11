import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import LockIcon from "@mui/icons-material/Lock";
import { PALETTES, paletteOf } from "./palette";

// Skyline: a drop-in replacement for Garden. Each exchange is an isometric building on a ring road around
// the coordinator's golden tower. Building height = data held (sqrt scale) x reward share. Weight updates
// travel the roads as glowing packets; raw transactions never do. Rejected updates stop short and burst.
const W = 1200, H = 780, CX = W / 2, CY = 478, RX = 420, RY = 196;
const BACK = [0.34, 1.56, 0.64, 1]; // easeOutBack: buildings overshoot a little as they grow
const PULSE_MS = 1300;
const HMAX = 240; // every body is drawn this tall and sunk into the ground by (HMAX - h); see Building
const H_MIN = 50, H_CAP = 205;
const HUB = "#f0a020", RED = "#c2410c", INK = "var(--ink)", MUTED = "var(--muted)";
const TILT = 9; // resting rotateX (deg) for the "popping out" perspective
const PODIUM = 8;
const TOWER_TIERS = [
  { w: 34, y0: 0, y1: 200 },
  { w: 26, y0: 200, y1: 285 },
  { w: 17, y0: 285, y1: 330 },
];
const MAST = 44;
const MIN_COS = 0.36;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fx = (n) => Math.round(n * 10) / 10;

// ---------- isometric geometry (2:1 dimetric; world (x,y) -> screen (x-y, (x+y)/2)) ----------
function footprint(w, d) {
  return { N: [d - w, -(w + d) / 2], E: [w + d, (w - d) / 2], S: [w - d, (w + d) / 2], W: [-w - d, (d - w) / 2] };
}
const pt = ([x, y]) => `${fx(x)},${fx(y)}`;
const poly = (pts) => `M${pts.map(pt).join("L")}Z`;
const up = ([x, y], v) => [x, y - v];

/** The three visible faces of a prism standing from height y0 to y1 (local origin = footprint centre). */
function faces(w, d, y0, y1) {
  const { N, E, S, W: Wp } = footprint(w, d);
  return {
    left: poly([up(Wp, y0), up(S, y0), up(S, y1), up(Wp, y1)]),
    right: poly([up(S, y0), up(E, y0), up(E, y1), up(S, y1)]),
    top: poly([up(N, y1), up(E, y1), up(S, y1), up(Wp, y1)]),
  };
}

function hash(...xs) {
  let h = 2166136261;
  for (const x of xs) { h = Math.imul(h ^ (x | 0), 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 10007) / 10007;
}
function hashStr(s) {
  let h = 7;
  for (const ch of String(s)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** A grid of window parallelograms on the face running A->B, packed into three compound paths. */
function windows(A, B, top, seed, { litP, pitch, wh, colW, twk }) {
  const cols = Math.max(2, Math.round(Math.abs(B[0] - A[0]) / colW));
  const ex = B[0] - A[0], ey = B[1] - A[1];
  let lit = "", dim = "", tw = "";
  for (let r = 0; 12 + r * pitch + wh <= top - 10; r++) {
    const v0 = 12 + r * pitch, v1 = v0 + wh;
    for (let c = 0; c < cols; c++) {
      const t0 = (c + 0.18) / cols, t1 = (c + 0.82) / cols;
      const s = poly([
        [A[0] + ex * t0, A[1] + ey * t0 - v0], [A[0] + ex * t1, A[1] + ey * t1 - v0],
        [A[0] + ex * t1, A[1] + ey * t1 - v1], [A[0] + ex * t0, A[1] + ey * t0 - v1],
      ]);
      const q = hash(seed, r, c);
      if (q < twk) tw += s; else if (q < litP) lit += s; else dim += s;
    }
  }
  return { lit, dim, tw };
}

const FOOTPRINTS = [[28, 28], [34, 24], [24, 34], [30, 30], [36, 26], [26, 36]];
function dimsOf(f, density = 1) {
  const k = hashStr(f.kind || f.name || "");
  const [w0, d0] = FOOTPRINTS[k % FOOTPRINTS.length];
  const fit = density < 0.85 ? 0.86 : 1; // slimmer plots on crowded rings
  return { w: Math.round(w0 * fit), d: Math.round(d0 * fit), roof: ((k >> 2) + f.lab) % 4 };
}
const CROWN_H = [10, 50, 30, 16];
const baseHeight = (n) => clamp(36 + 1.45 * Math.sqrt(Math.max(0, n || 0)), 70, 175);
// fuller rings get lower skylines so neighbours on the same side never swallow each other
const densityOf = (count) => (count <= 5 ? 1 : count === 6 ? 0.88 : count === 7 ? 0.76 : 0.64);
const heightOf = (f, density = 1) => clamp(baseHeight(f.n) * clamp(f.scale ?? 1, 0.6, 1.6) * density, H_MIN, H_CAP);

function crownTiers(w, d, roof) {
  if (roof === 0) return [{ w: w * 0.34, d: d * 0.34, y0: HMAX, y1: HMAX + 10, dx: -w * 0.4, dy: 2 }, { w: w * 0.2, d: d * 0.2, y0: HMAX, y1: HMAX + 6, dx: w * 0.55, dy: 0 }];
  if (roof === 1) return [{ w: w * 0.2, d: d * 0.2, y0: HMAX, y1: HMAX + 8, dx: 0, dy: 0 }];
  if (roof === 2) return [{ w: w * 0.62, d: d * 0.62, y0: HMAX, y1: HMAX + 30, dx: 0, dy: 0 }];
  return [{ w: w * 0.3, d: d * 0.3, y0: HMAX, y1: HMAX + 16, dx: -w * 0.5, dy: 4 }, { w: w * 0.22, d: d * 0.22, y0: HMAX, y1: HMAX + 10, dx: w * 0.5, dy: -2 }];
}

function buildGeometry(lab, w, d, roof) {
  const p = footprint(w, d);
  const body = faces(w, d, 0, HMAX);
  const opts = { litP: 0.72, pitch: 16, wh: 9, colW: 13, twk: 0.07 };
  return {
    p,
    body,
    crown: crownTiers(w, d, roof).map((t) => ({ ...faces(t.w, t.d, t.y0, t.y1), dx: t.dx, dy: t.dy })),
    winL: windows(p.W, p.S, HMAX, lab * 7 + 1, opts),
    winR: windows(p.S, p.E, HMAX, lab * 7 + 2, opts),
    clip: poly([p.W, p.S, p.E, [p.E[0], -2000], [p.W[0], -2000]]),
  };
}

function shadowPath(w, d, h, k = 0.5) {
  const { N, E, S, W: Wp } = footprint(w, d);
  const L = h * k, sx = L * 0.9, sy = L * 0.3;
  return poly([Wp, N, [N[0] + sx, N[1] + sy], [E[0] + sx, E[1] + sy], [S[0] + sx, S[1] + sy], S]);
}

function layout(n) {
  const rot = n % 2 ? 22 : 0; // odd counts: nudge so nobody sits dead-ahead of the tower label
  return Array.from({ length: n }, (_, k) => {
    const a = ((-90 + (360 * (k + 0.5)) / n + rot) * Math.PI) / 180;
    // keep clear of the tower's own column: nobody hides directly behind (or in front of) it
    const c = Math.abs(Math.cos(a)) < MIN_COS ? MIN_COS * (Math.cos(a) < 0 ? -1 : 1) : Math.cos(a);
    const s = Math.sin(a) < 0 ? -Math.sqrt(1 - c * c) : Math.sqrt(1 - c * c);
    return { x: CX + RX * c, y: CY + RY * s };
  });
}

const CSS = `
.sk-b{cursor:pointer;outline:none}
.sk-b .sk-lift{transition:filter .25s}
.sk-b:hover .sk-lift,.sk-b:focus-visible .sk-lift{filter:drop-shadow(0 10px 7px rgba(70,40,15,.3)) brightness(1.04)}
.sk-b:focus-visible .sk-lift{filter:drop-shadow(0 0 5px rgba(217,112,58,.9))}
@keyframes sk-flicker{0%{opacity:0}8%{opacity:.95}14%{opacity:.1}26%{opacity:1}34%{opacity:.3}48%{opacity:1}60%{opacity:.65}100%{opacity:1}}
@keyframes sk-twinkle{0%,100%{opacity:1}42%,58%{opacity:.2}}
@keyframes sk-blink{0%,55%{opacity:1}56%,100%{opacity:.12}}
@keyframes sk-halo{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.45);opacity:0}}
@keyframes sk-beacon{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.35)}}
@keyframes sk-flow{to{stroke-dashoffset:-44}}
.sk-flick{animation:sk-flicker 1.6s linear both}
.sk-twk{animation:sk-flicker 1.6s linear both,sk-twinkle 5s ease-in-out infinite}
.sk-blink{animation:sk-blink 1.1s steps(1,end) infinite}
.sk-halo{transform-box:fill-box;transform-origin:center;animation:sk-halo 3.4s ease-out infinite}
.sk-beacon{transform-box:fill-box;transform-origin:center;animation:sk-beacon 2.4s ease-in-out infinite}
.sk-flow{animation:sk-flow 1.1s linear infinite}
@media (prefers-reduced-motion: reduce){.sk-flick,.sk-twk,.sk-blink,.sk-halo,.sk-beacon,.sk-flow{animation:none}}
`;

function Defs() {
  return (
    <defs>
      {Object.entries(PALETTES).map(([k, [deep, mid, light]]) => (
        <React.Fragment key={k}>
          <linearGradient id={`sk-L-${k}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={mid} /><stop offset="1" stopColor={light} />
          </linearGradient>
          <linearGradient id={`sk-R-${k}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={deep} /><stop offset="1" stopColor={mid} />
          </linearGradient>
          <linearGradient id={`sk-T-${k}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={light} /><stop offset="1" stopColor="#fffdf9" />
          </linearGradient>
          <radialGradient id={`sk-G-${k}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={mid} stopOpacity="0.55" /><stop offset="1" stopColor={mid} stopOpacity="0" />
          </radialGradient>
        </React.Fragment>
      ))}
      <linearGradient id="sk-TL" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#f0a020" /><stop offset="1" stopColor="#fdeaa6" /></linearGradient>
      <linearGradient id="sk-TR" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#9a5a0c" /><stop offset="1" stopColor="#e39a1c" /></linearGradient>
      <linearGradient id="sk-TT" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#fff0bd" /><stop offset="1" stopColor="#fffdf0" /></linearGradient>
      <linearGradient id="sk-PL" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#d9b86a" /><stop offset="1" stopColor="#f3dfa6" /></linearGradient>
      <linearGradient id="sk-PR" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#a8803a" /><stop offset="1" stopColor="#c9a24f" /></linearGradient>
      <radialGradient id="sk-beacon-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" /><stop offset="0.35" stopColor="#fcd34d" stopOpacity="0.5" /><stop offset="1" stopColor="#fcd34d" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sk-red-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ef4444" stopOpacity="0.9" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sk-plaza" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fcd34d" stopOpacity="0.5" /><stop offset="1" stopColor="#fcd34d" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sk-floor" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#efdfc6" stopOpacity="0.95" /><stop offset="0.7" stopColor="#f3e7d3" stopOpacity="0.6" /><stop offset="1" stopColor="#f6ecdc" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="sk-fade" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset="0.55" stopColor="#fff" stopOpacity="0.85" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <mask id="sk-grid-mask" maskUnits="userSpaceOnUse" x="0" y={CY - 330} width={W} height="660">
        <rect x="0" y={CY - 330} width={W} height="660" fill="url(#sk-fade)" />
      </mask>
      <filter id="sk-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="sk-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6" /></filter>
    </defs>
  );
}

// ---------- ground plane ----------
const GRID_STEP = 70, GRID_N = 700;
const GRID = (() => {
  const P = (x, y) => [CX + (x - y), CY + (x + y) / 2];
  let d = "";
  for (let i = -GRID_N; i <= GRID_N; i += GRID_STEP) {
    const [a1, b1] = P(i, -GRID_N), [a2, b2] = P(i, GRID_N);
    const [a3, b3] = P(-GRID_N, i), [a4, b4] = P(GRID_N, i);
    d += `M${a1},${b1}L${a2},${b2}M${a3},${b3}L${a4},${b4}`;
  }
  return d;
})();

function Ground() {
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x="0" y={CY - 330} width={W} height="660" fill="url(#sk-floor)" />
      <path d={GRID} fill="none" stroke="#cdbba2" strokeWidth={1.2} strokeOpacity={0.55} mask="url(#sk-grid-mask)" />
      <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="#e7d8c4" strokeWidth={16} />
      <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="#fffdf9" strokeOpacity={0.8} strokeWidth={1.6} strokeDasharray="7 9" />
      <ellipse cx={CX} cy={CY} rx={190} ry={95} fill="url(#sk-plaza)" />
    </g>
  );
}

function Road({ f, pos, index, act }) {
  const dead = f.attacker || f.rejected;
  const [a, b] = act?.out === false ? [pos, { x: CX, y: CY }] : [{ x: CX, y: CY }, pos];
  const color = act?.out === false ? f.color : HUB;
  return (
    <g>
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + index * 0.18, duration: 0.7 }}>
        <line x1={CX} y1={CY} x2={pos.x} y2={pos.y} stroke={dead ? "#ecd0c2" : "#e7d8c4"} strokeWidth={15} />
        <line x1={CX} y1={CY} x2={pos.x} y2={pos.y} stroke={dead ? RED : "#fffdf9"} strokeOpacity={dead ? 0.85 : 0.9}
          strokeWidth={dead ? 2 : 1.6} strokeDasharray={dead ? "5 8" : "7 9"} />
      </motion.g>
      <motion.line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={dead && !act ? RED : color} strokeWidth={5} strokeLinecap="round"
        strokeDasharray="10 12" className={act ? "sk-flow" : undefined} filter="url(#sk-glow)"
        initial={{ opacity: 0 }} animate={{ opacity: act ? 0.9 : 0 }} transition={{ duration: 0.25 }} />
    </g>
  );
}

/** Soft coloured pool + cast shadow under a building, kept on the ground layer so it never overlays a neighbour. */
const GroundFx = memo(function GroundFx({ f, pos, index, hov, density }) {
  const { w, d } = dimsOf(f, density);
  const h = heightOf(f, density);
  const pal = paletteOf(f.lab, f.attacker);
  const dead = f.attacker || f.rejected;
  const tr = { delay: 0.35 + index * 0.2, duration: 1.5, ease: BACK };
  return (
    <g transform={`translate(${pos.x},${pos.y})`} style={{ pointerEvents: "none" }}>
      <ellipse rx={(w + d) * 1.35} ry={(w + d) * 0.68} fill={`url(#sk-G-${dead ? "thorn" : pal})`} />
      <motion.path initial={{ d: shadowPath(w, d, 0) }} animate={{ d: shadowPath(w, d, h) }} transition={tr}
        fill="#46280f" fillOpacity={hov ? 0.4 : 0.26} filter="url(#sk-blur)" style={{ transition: "fill-opacity .25s" }} />
      {f.rejected && (
        <motion.ellipse rx={(w + d) * 1.1} ry={(w + d) * 0.55} fill="none" stroke={RED} strokeWidth={2.2} strokeDasharray="6 5"
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: BACK }} />
      )}
    </g>
  );
});

// ---------- buildings ----------
const Solid = memo(function Solid({ geo, pal }) {
  const stroke = PALETTES[pal][0];
  const set = (g, key) => (
    <g key={key} transform={`translate(${g.dx || 0},${g.dy || 0})`}>
      <path d={g.left} fill={`url(#sk-L-${pal})`} stroke={stroke} strokeOpacity={0.3} strokeWidth={0.8} />
      <path d={g.right} fill={`url(#sk-R-${pal})`} stroke={stroke} strokeOpacity={0.3} strokeWidth={0.8} />
      <path d={g.top} fill={`url(#sk-T-${pal})`} stroke={stroke} strokeOpacity={0.35} strokeWidth={0.8} />
    </g>
  );
  return (<>{set(geo.body, "b")}{geo.crown.map((c, i) => set(c, i))}</>);
});

function Lit({ win, delay, left }) {
  const c = left ? "#fff1bf" : "#ffe08a";
  const twDelay = (i) => `${delay + 2.2 + i * 0.9}s`;
  return (
    <g>
      <path d={win.dim} fill="#3a2a1c" fillOpacity={0.26} />
      <path d={win.lit} fill={c} className="sk-flick" style={{ animationDelay: `${delay}s` }} />
      <path d={win.tw} fill={c} className="sk-twk" style={{ animationDelay: `${delay}s, ${twDelay(left ? 0 : 1)}` }} />
    </g>
  );
}

function LabelBlock({ f, back, w, d, h, crown }) {
  const lines = [
    { t: f.name, size: 17, weight: 700, fill: INK },
    { t: `${f.kind}${f.n ? ` · ${f.n.toLocaleString()} tx` : ""}`, size: 12, weight: 500, fill: MUTED },
    ...(f.status ? [{ t: f.status, size: 12.5, weight: 700, fill: f.statusColor || MUTED }] : []),
  ];
  const pitch = 17;
  const halo = { paintOrder: "stroke", stroke: "#fbf6ee", strokeWidth: 5, strokeLinejoin: "round" };
  const body = lines.map((l, i) => (
    <text key={i} x={0} y={back ? -(lines.length - 1 - i) * pitch : i * pitch} textAnchor="middle" fontSize={l.size}
      fontWeight={l.weight} fill={l.fill} style={halo}>{l.t}</text>
  ));
  if (!back) return <g transform={`translate(0,${(w + d) / 2 + 22})`}>{body}</g>;
  const anchor = -(w + d) / 2 - crown - 26;
  return (
    <motion.g initial={{ y: 0 }} animate={{ y: -h }} transition={{ duration: 0.9, ease: BACK }}>
      <g transform={`translate(0,${anchor})`}>{body}</g>
    </motion.g>
  );
}

const Building = memo(function Building({ f, pos, index, back, hov, density, onHover, onPick }) {
  const { w, d, roof } = dimsOf(f, density);
  const pal = paletteOf(f.lab, f.attacker);
  const dead = !!(f.attacker || f.rejected);
  const h = heightOf(f, density);
  const geo = useMemo(() => buildGeometry(f.lab, w, d, roof), [f.lab, w, d, roof]);
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  const delay = first.current ? 0.35 + index * 0.2 : 0;
  const tr = { delay, duration: first.current ? 1.5 : 0.9, ease: BACK };
  const crownH = CROWN_H[roof];
  const lightsAt = 0.35 + index * 0.2 + 1.3;
  const clipId = `sk-clip-${f.lab}`;
  const tipY = roof === 1 ? -HMAX - 8 - 42 : -HMAX - crownH - 4;
  return (
    <g transform={`translate(${pos.x},${pos.y})`} className="sk-b" role="button" tabIndex={0} aria-label={`About ${f.name}`}
      onClick={() => onPick?.(f.lab)} onKeyDown={(e) => e.key === "Enter" && onPick?.(f.lab)}
      onPointerEnter={() => onHover(f.lab)} onPointerLeave={() => onHover(null)}>
      <clipPath id={clipId}><path d={geo.clip} /></clipPath>
      <motion.g animate={{ y: hov ? -6 : 0 }} transition={{ type: "spring", stiffness: 380, damping: 22 }}>
        <g className="sk-lift">
          <g clipPath={`url(#${clipId})`}>
            <motion.g initial={{ y: HMAX }} animate={{ y: HMAX - h }} transition={tr}>
              <Solid geo={geo} pal={pal} />
              {/* rejected / attacker: the same masses re-skinned in the desaturated "thorn" palette */}
              <g style={{ opacity: dead ? 1 : 0, transition: "opacity .6s" }}><Solid geo={geo} pal="thorn" /></g>
              <line x1={geo.p.S[0]} y1={geo.p.S[1]} x2={geo.p.S[0]} y2={geo.p.S[1] - HMAX} stroke="#fff" strokeOpacity={0.4} strokeWidth={1.2} />
              <line x1={geo.p.W[0]} y1={geo.p.W[1]} x2={geo.p.W[0]} y2={geo.p.W[1] - HMAX} stroke="#fff" strokeOpacity={0.22} strokeWidth={1} />
              <g style={{ opacity: dead ? 0.08 : 1, transition: "opacity .7s" }}>
                <g filter="url(#sk-glow)">
                  <Lit win={geo.winL} delay={lightsAt} left />
                  <Lit win={geo.winR} delay={lightsAt + 0.15} left={false} />
                </g>
              </g>
              {roof === 1 && <line x1={0} y1={-HMAX - 8} x2={0} y2={tipY} stroke="#5b4636" strokeWidth={2} strokeLinecap="round" />}
              {dead && (
                <g transform={`translate(0,${tipY - 6})`}>
                  <g className="sk-blink">
                    <circle r={18} fill="url(#sk-red-glow)" />
                    <circle r={3.8} fill="#ef4444" stroke="#fff" strokeWidth={1} />
                  </g>
                </g>
              )}
            </motion.g>
          </g>
        </g>
      </motion.g>
      {/* the private data never leaves: a vault badge on the front corner */}
      <g transform={`translate(${w - d},${(w + d) / 2 - 18})`} style={{ pointerEvents: "none" }}>
        <circle r={10.5} fill="var(--panel)" stroke="var(--line)" strokeWidth={1} />
        <LockIcon x={-6} y={-6} width={12} height={12} style={{ color: "var(--muted)" }} />
      </g>
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 + index * 0.2, duration: 0.5 }}>
        <LabelBlock f={f} back={back} w={w} d={d} h={h} crown={crownH} />
      </motion.g>
    </g>
  );
});

// ---------- the coordinator ----------
function towerGeometry() {
  const opts = { litP: 0.9, pitch: 11, wh: 6, colW: 9, twk: 0.06 };
  return TOWER_TIERS.map((t, i) => {
    const p = footprint(t.w, t.w);
    return {
      ...faces(t.w, t.w, t.y0, t.y1),
      winL: windows(up(p.W, t.y0), up(p.S, t.y0), t.y1 - t.y0, 90 + i, opts),
      winR: windows(up(p.S, t.y0), up(p.E, t.y0), t.y1 - t.y0, 95 + i, opts),
    };
  });
}
const TOWER_TOP = TOWER_TIERS[TOWER_TIERS.length - 1].y1;

const Tower = memo(function Tower({ flash }) {
  const geo = useMemo(towerGeometry, []);
  const pod = useMemo(() => faces(52, 52, 0, PODIUM), []);
  const base = footprint(TOWER_TIERS[0].w, TOWER_TIERS[0].w);
  const clip = useMemo(() => poly([base.W, base.S, base.E, [base.E[0], -2000], [base.W[0], -2000]]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const sheen = useMemo(() => {
    const t = TOWER_TIERS[0], p = footprint(t.w, t.w);
    const at = (u, v) => [p.W[0] + (p.S[0] - p.W[0]) * u, p.W[1] + (p.S[1] - p.W[1]) * u - v];
    return poly([at(0.15, 0), at(0.5, 0), at(0.85, t.y1), at(0.5, t.y1)]);
  }, []);
  const inset = useMemo(() => poly(Object.values(footprint(41, 41)).map(([x, y]) => [x, y - PODIUM])), []);
  return (
    <g transform={`translate(${CX},${CY})`}>
      <path d={pod.left} fill="url(#sk-PL)" /><path d={pod.right} fill="url(#sk-PR)" />
      <path d={pod.top} fill="#f6e7b5" stroke="#c9a24f" strokeOpacity={0.6} strokeWidth={1} />
      <path d={inset} fill="none" stroke={HUB} strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="5 5" />
      <g transform={`translate(0,${-PODIUM})`}>
        <clipPath id="sk-clip-tower"><path d={clip} /></clipPath>
        <g clipPath="url(#sk-clip-tower)">
          <motion.g initial={{ y: TOWER_TOP + MAST + 40 }} animate={{ y: 0 }} transition={{ delay: 0.05, duration: 1.7, ease: BACK }}>
            {geo.map((g, i) => (
              <g key={i}>
                <path d={g.left} fill="url(#sk-TL)" stroke="#b8760f" strokeOpacity={0.35} strokeWidth={0.8} />
                <path d={g.right} fill="url(#sk-TR)" stroke="#7a4408" strokeOpacity={0.35} strokeWidth={0.8} />
                <path d={g.top} fill="url(#sk-TT)" stroke="#b8760f" strokeOpacity={0.4} strokeWidth={0.8} />
                <g filter="url(#sk-glow)">
                  <path d={g.winL.lit} fill="#fffbe6" className="sk-flick" style={{ animationDelay: "1.1s" }} />
                  <path d={g.winR.lit} fill="#ffedb0" className="sk-flick" style={{ animationDelay: "1.25s" }} />
                  <path d={g.winL.tw} fill="#fffbe6" className="sk-twk" style={{ animationDelay: "1.1s, 3.4s" }} />
                  <path d={g.winR.tw} fill="#ffedb0" className="sk-twk" style={{ animationDelay: "1.25s, 4.1s" }} />
                </g>
                <path d={g.winL.dim} fill="#7a4408" fillOpacity={0.2} /><path d={g.winR.dim} fill="#4a2a05" fillOpacity={0.25} />
              </g>
            ))}
            <path d={sheen} fill="#fff" fillOpacity={0.14} />
            <line x1={base.S[0]} y1={base.S[1]} x2={base.S[0]} y2={base.S[1] - TOWER_TIERS[0].y1} stroke="#fff" strokeOpacity={0.55} strokeWidth={1.4} />
            <line x1={0} y1={-TOWER_TOP} x2={0} y2={-TOWER_TOP - MAST} stroke="#8a5a1c" strokeWidth={2.4} strokeLinecap="round" />
            <g transform={`translate(0,${-TOWER_TOP - MAST - 4})`}>
              <circle className="sk-beacon" r={46} fill="url(#sk-beacon-glow)" />
              <motion.circle key={flash} r={10} fill="none" stroke={HUB} strokeWidth={3}
                initial={{ scale: 0.6, opacity: flash ? 0.95 : 0 }} animate={{ scale: 4.2, opacity: 0 }} transition={{ duration: 1.3, ease: "easeOut" }} />
              <circle r={7} fill="#fff3c4" stroke={HUB} strokeWidth={2} />
              <circle r={3} fill="#fff" />
            </g>
          </motion.g>
        </g>
      </g>
    </g>
  );
});

// ---------- weight updates travelling the roads ----------
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const FLOAT = 9; // packets hover a little above the asphalt

function Packet({ p, from, to }) {
  const [a, b] = p.out ? [from, to] : [to, from];
  const stop = p.rejected ? lerp(a, b, 0.62) : b;
  const dur = p.rejected ? 1.0 : 1.2;
  const color = p.rejected ? RED : p.out ? HUB : p.color;
  return (
    <g>
      <motion.ellipse rx={7} ry={3} fill="#46280f" initial={{ cx: a.x, cy: a.y, opacity: 0 }}
        animate={{ cx: [a.x, stop.x], cy: [a.y, stop.y], opacity: [0, 0.3, 0.3, 0] }} transition={{ duration: dur, ease: "easeInOut" }} />
      {[0, 1, 2].map((i) => (
        <motion.circle key={i} r={[7.5, 5.5, 3.8][i]} fill={color} stroke={i === 0 ? "#fffdf9" : "none"} strokeWidth={1.5}
          filter={i === 0 ? "url(#sk-glow)" : undefined}
          initial={{ cx: a.x, cy: a.y - FLOAT, opacity: 0 }}
          animate={{ cx: [a.x, stop.x], cy: [a.y - FLOAT, stop.y - FLOAT], opacity: [0, [1, 0.55, 0.3][i], [1, 0.55, 0.3][i], 0] }}
          transition={{ duration: dur, delay: i * 0.07, ease: "easeInOut" }} />
      ))}
    </g>
  );
}

const PARTICLES = Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2);
function Burst({ at }) {
  const t = { delay: 0.85, duration: 0.9 };
  return (
    <g transform={`translate(${at.x},${at.y - FLOAT})`} style={{ pointerEvents: "none" }}>
      <motion.ellipse rx={10} ry={5} fill="none" stroke={RED} strokeWidth={3} initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 4], opacity: [0.9, 0] }} transition={{ ...t, ease: "easeOut" }} />
      {PARTICLES.map((a, i) => (
        <motion.circle key={i} r={3} fill={RED} initial={{ cx: 0, cy: 0, opacity: 0 }}
          animate={{ cx: [0, Math.cos(a) * 36], cy: [0, Math.sin(a) * 18 - 6], opacity: [0, 1, 0] }} transition={{ ...t, duration: 0.8 }} />
      ))}
      <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.35, 1, 1], opacity: [0, 1, 1, 0] }}
        transition={{ delay: 0.85, duration: 1.7, times: [0, 0.15, 0.3, 1] }}>
        <path d="M0,-19 L14,-13 V0 C14,10 7,16 0,20 C-7,16 -14,10 -14,0 V-13 Z" fill={RED} stroke="#fffdf9" strokeWidth={2} />
        <path d="M-5,-5 L5,5 M5,-5 L-5,5" stroke="#fffdf9" strokeWidth={2.6} strokeLinecap="round" />
      </motion.g>
    </g>
  );
}

/**
 * flowers: [{ lab, name, kind, n, attacker, rejected, scale, status, statusColor, color }]
 * event:   { id, kind: "broadcast" | "updates", rejected: number[] } from useFederation
 * Same props as Garden; each flower is drawn as a building.
 */
export default function Skyline({ flowers, event, caption, onPick }) {
  const positions = useMemo(() => layout(flowers.length), [flowers.length]);
  const density = densityOf(flowers.length);
  const [pulses, setPulses] = useState([]);
  const [active, setActive] = useState({});
  const [flash, setFlash] = useState(0);
  const [hovLab, setHovLab] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!event) return;
    const out = event.kind === "broadcast";
    const add = flowers.map((f, k) => ({
      uid: `${event.id}-${k}`, k, out, color: f.color,
      rejected: !out && event.rejected.includes(f.lab),
    }));
    setPulses((ps) => [...ps, ...add].slice(-24));
    setActive((a) => ({ ...a, ...Object.fromEntries(flowers.map((f) => [f.lab, { ts: Date.now(), out }])) }));
    if (out) setFlash(event.id + 1);
    else setTimeout(() => mounted.current && setFlash(event.id + 1), 1000);
    setTimeout(() => {
      if (!mounted.current) return;
      setPulses((ps) => ps.filter((p) => !add.includes(p)));
      setActive((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => Date.now() - v.ts < PULSE_MS)));
    }, PULSE_MS + 900);
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = useMemo(
    () => [{ key: "tower", y: CY, k: -1 }, ...flowers.map((f, k) => ({ key: f.lab, y: positions[k].y, k }))].sort((a, b) => a.y - b.y || a.k - b.k),
    [flowers, positions],
  );

  // gentle mouse parallax on top of the resting 3D tilt
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 70, damping: 16, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 70, damping: 16, mass: 0.6 });
  const rotateY = useTransform(sx, (v) => v * 3);
  const rotateX = useTransform(sy, (v) => TILT - v * 2.5);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1));
    my.set(clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1));
  };
  const onLeave = () => { mx.set(0); my.set(0); };

  const hub = { x: CX, y: CY };
  const sunk = [...pulses].filter((p) => p.rejected && positions[p.k]);
  return (
    <div style={{ width: "100%", height: "100%", perspective: 1400, position: "relative" }} onPointerMove={onMove} onPointerLeave={onLeave}>
      <motion.div style={{ width: "100%", height: "100%", rotateX, rotateY, scale: 0.97, transformOrigin: "50% 62%", transformStyle: "preserve-3d" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
          <style>{CSS}</style>
          <Defs />
          <Ground />
          <g style={{ pointerEvents: "none" }}>
            {flowers.map((f, k) => <Road key={`r-${f.lab}`} f={f} pos={positions[k]} index={k} act={active[f.lab]} />)}
            <motion.path initial={{ d: shadowPath(34, 34, 0, 0.42) }} animate={{ d: shadowPath(34, 34, TOWER_TOP + MAST, 0.42) }}
              transform={`translate(${CX},${CY - PODIUM})`} transition={{ delay: 0.05, duration: 1.7, ease: BACK }}
              fill="#46280f" fillOpacity={0.24} filter="url(#sk-blur)" />
            {flash > 0 && (
              <motion.ellipse key={`h${flash}`} cx={CX} cy={CY} rx={104} ry={52} fill="none" stroke={HUB} strokeWidth={3}
                initial={{ scale: 1, opacity: 0.9 }} animate={{ scale: 2.3, opacity: 0 }} transition={{ duration: 1.3, ease: "easeOut" }} />
            )}
            <ellipse className="sk-halo" cx={CX} cy={CY} rx={104} ry={52} fill="none" stroke={HUB} strokeWidth={2.4} />
            {flowers.map((f, k) => (
              <GroundFx key={`g-${f.lab}`} f={f} pos={positions[k]} index={k} hov={hovLab === f.lab} density={density} />
            ))}
            {pulses.map((p) => positions[p.k] && <Packet key={p.uid} p={p} from={hub} to={positions[p.k]} />)}
          </g>
          {order.map((o) => {
            if (o.key === "tower") return <Tower key="tower" flash={flash} />;
            const f = flowers[o.k], pos = positions[o.k];
            return (
              <Building key={f.lab} f={f} pos={pos} index={o.k} back={pos.y < CY - 8} hov={hovLab === f.lab} density={density}
                onHover={setHovLab} onPick={onPick} />
            );
          })}
          <g style={{ pointerEvents: "none" }}>
            {sunk.map((p) => <Burst key={`b-${p.uid}`} at={lerp(hub, positions[p.k], 0.62)} />)}
            <g transform={`translate(${CX},${CY + 52 + 26})`}>
              <text textAnchor="middle" fontSize={18} fontWeight={700} fill={INK} style={{ paintOrder: "stroke", stroke: "#fbf6ee", strokeWidth: 5, strokeLinejoin: "round" }}>Coordinator</text>
              <text y={18} textAnchor="middle" fontSize={12} fill={MUTED} style={{ paintOrder: "stroke", stroke: "#fbf6ee", strokeWidth: 5, strokeLinejoin: "round" }}>{caption}</text>
            </g>
          </g>
        </svg>
      </motion.div>
    </div>
  );
}
