import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Blossom } from "../Garden.jsx";
import { colorOf, paletteOf, pct } from "../palette";
import type { Snapshot } from "./runConsortium";

export const POOL_CUSD = 10_000;

function Panel({ children }: { children: React.ReactNode }) {
  return <Box p={6} borderRadius="16px" bg="var(--panel)" border="1px solid var(--line)">{children}</Box>;
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--muted)">{children}</Text>
);

export function rejectedRounds(snap: Snapshot, lab: number) {
  return snap.results.filter((r) => r.labs[lab] && !r.labs[lab].accepted).length;
}

function Curves({ snap }: { snap: Snapshot }) {
  const data = Array.from({ length: snap.totalRounds }, (_, r) => {
    const row: Record<string, number | undefined> = { round: r + 1, consortium: snap.results[r]?.catchRate };
    snap.members.forEach((m) => (row[m.id] = snap.solo[m.id]?.[r]));
    return row;
  });
  return (
    <>
      <Eyebrow>CATCH RATE ON FUTURE WEEKS NO ONE TRAINED ON</Eyebrow>
      <Text fontSize="20px" fontWeight={700} mt={1}>The shared model vs each provider training alone</Text>
      <Box h="300px" mt={4}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="round" tick={{ fontSize: 11, fill: "#8a7663" }} stroke="#eadccb" />
            <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: "#8a7663" }} stroke="#eadccb" domain={["auto", "auto"]} width={48} />
            <Tooltip formatter={(v) => pct(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #eadccb", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {snap.members.map((m, lab) => (
              <Line key={m.id} type="monotone" dataKey={m.id} name={`${m.name} alone`}
                stroke={colorOf(lab, rejectedRounds(snap, lab) > 0)} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            ))}
            <Line type="monotone" dataKey="consortium" name="Shared consortium model" stroke="#d9703a" strokeWidth={3.5} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </>
  );
}

function Payouts({ snap }: { snap: Snapshot }) {
  const contribution = snap.members.map((_, lab) => snap.results.reduce((a, r) => a + (r.labs[lab]?.shapley ?? 0), 0));
  const maxAbs = Math.max(1e-12, ...contribution.map(Math.abs));
  const done = snap.phase === "done" && snap.payoutBps;
  return (
    <>
      <Eyebrow>{done ? "PAYOUTS FOR THIS RUN" : "CONTRIBUTION SO FAR"}</Eyebrow>
      <Text fontSize="20px" fontWeight={700} mt={1}>What each dataset was worth</Text>
      <Text fontSize="13px" color="var(--ink-2)" mt={1} lineHeight={1.6}>
        Each round the coordinator rebuilds the model from every subset of providers ({1 << snap.members.length} coalitions) and measures what
        each one adds on a shared validation window (exact Shapley values). A {POOL_CUSD.toLocaleString()} cUSD pool is split in proportion.
        Updates that disagree with the consortium are rejected and earn 0.
      </Text>
      <Box mt={3}>
        {snap.members.map((m, lab) => {
          const c = contribution[lab];
          const rej = rejectedRounds(snap, lab);
          const bps = snap.payoutBps?.[lab] ?? 0;
          return (
            <Flex key={m.id} align="center" gap={3} py={3} borderBottom="1px solid var(--line)" px={2} borderRadius="8px">
              <Blossom pal={paletteOf(lab, rej > 0)} size={32} wilt={rej > 0} />
              <Box w={{ base: "110px", md: "170px" }} flexShrink={0}>
                <Text fontSize="14px" fontWeight={650}>{m.name}</Text>
                <Text fontSize="11px" color="var(--muted)">{m.kind} · {m.n.toLocaleString()} tx</Text>
              </Box>
              <Box flex={1} position="relative" h="10px" borderRadius="6px" bg="var(--panel-2)" overflow="hidden">
                <Box position="absolute" top={0} bottom={0} left={c >= 0 ? "50%" : `${50 - (Math.abs(c) / maxAbs) * 50}%`}
                  w={`${(Math.abs(c) / maxAbs) * 50}%`} bg={c >= 0 ? colorOf(lab) : "#c2410c"} borderRadius="6px" />
                <Box position="absolute" left="50%" top={0} bottom={0} w="1px" bg="var(--line)" />
              </Box>
              <Box w="130px" textAlign="right" flexShrink={0}>
                <Text fontSize="16px" fontWeight={750} color={done && bps === 0 ? "#c2410c" : undefined}>
                  {done ? `${Math.round((bps / 10000) * POOL_CUSD).toLocaleString()} cUSD` : "…"}
                </Text>
                <Text fontSize="11px" color={rej ? "#c2410c" : "var(--muted)"}>
                  {rej ? `rejected ${rej}/${snap.results.length} rounds` : done ? `${(bps / 100).toFixed(1)}% of pool` : "accepted"}
                </Text>
              </Box>
            </Flex>
          );
        })}
      </Box>
    </>
  );
}

function Headline({ snap }: { snap: Snapshot }) {
  const last = snap.results.at(-1);
  if (!last) return null;
  const solos = snap.members.map((m, lab) => ({ m, lab, s: snap.solo[m.id]?.at(-1) ?? 0 })).filter((x) => !rejectedRounds(snap, x.lab));
  const best = solos.sort((a, b) => b.s - a.s)[0];
  const cut = snap.members.filter((_, lab) => rejectedRounds(snap, lab) > 0);
  const tiles: [string, string, string][] = [
    ["Shared consortium model", pct(last.catchRate), "of illicit transactions caught at a 1% false-alarm rate"],
    ["Best exchange alone", best ? pct(best.s) : "—", best ? `${best.m.name}, trained only on its own data` : ""],
    cut.length
      ? ["Cut from the payout", cut.map((m) => m.name).join(", "), "updates rejected: their data pulls against everyone else's"]
      : ["Paid out", snap.phase === "done" ? `${POOL_CUSD.toLocaleString()} cUSD` : "after the last round", `split across all ${snap.members.length} exchanges by contribution`],
  ];
  return (
    <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={4}>
      {tiles.map(([label, value, sub], i) => (
        <Box key={label} p={4} borderRadius="14px" bg={i === 0 ? "var(--accent-soft)" : i === 2 && cut.length ? "rgba(194,65,12,.08)" : "var(--panel-2)"}>
          <Text fontSize="12px" fontWeight={650} color="var(--ink-2)">{label}</Text>
          <Text fontSize={value.length > 14 ? "24px" : "34px"} fontWeight={850} lineHeight={1.15} mt={1} color={i === 0 ? "var(--accent)" : i === 2 && cut.length ? "#c2410c" : "var(--ink)"}>{value}</Text>
          <Text fontSize="12px" color="var(--muted)">{sub}</Text>
        </Box>
      ))}
    </Grid>
  );
}

export default function LiveResults({ snap }: { snap: Snapshot }) {
  if (!snap.results.length) return null;
  return (
    <Box id="results" mt={8} display="grid" gap={6}>
      <Panel><Headline snap={snap} /></Panel>
      <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 1.2fr) minmax(0, 1fr)" }} gap={6} alignItems="start">
        <Panel><Curves snap={snap} /></Panel>
        <Panel><Payouts snap={snap} /></Panel>
      </Grid>
    </Box>
  );
}
