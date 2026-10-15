import { useEffect, useRef, useState } from "react";
import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Slider, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup,
} from "@mui/material";
import UploadFile from "@mui/icons-material/UploadFile";
import Casino from "@mui/icons-material/Casino";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { KIND_DEFAULTS, KINDS, labelsFor, TRAIN_STEPS, type GenSpec, type Quality } from "./generate";
import { fetchSample, loadSchema, parseCsv, SAMPLE_BASE, SAMPLES } from "./csv";
import { statsOf, type Exchange } from "./useBuilder";
import { pct } from "../palette";
import { isAddress } from "viem";
import { newClaimWallet } from "../../chain/router";

const QUALITY: [Quality, string, string][] = [
  ["clean", "Clean", "Labels come from the fraud team's confirmed cases and chargebacks."],
  ["noisy", "Noisy labels", "30% of labels are wrong: an understaffed review queue guessing."],
  ["compromised", "Compromised", "Every label is inverted, as if a breached pipeline or an insider marked fraud as clean. Nobody is told; watch whether the consortium notices."],
];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const Label = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="11px" letterSpacing=".1em" fontWeight={700} color="var(--muted)" mt={4} mb={1}>{children}</Text>
);

function StepChart({ ex }: { ex: Exchange }) {
  const d = ex.data;
  if (!d?.steps) return null;
  const labels = labelsFor(d, ex.quality, 1);
  const rows = Array.from({ length: TRAIN_STEPS }, (_, k) => ({ step: k + 1, illicit: 0, licit: 0 }));
  d.steps.forEach((s, i) => {
    const row = rows[s - 1];
    if (!row) return;
    if (labels[i] === 1) row.illicit++;
    else if (labels[i] === 0) row.licit++;
  });
  return (
    <Box h="90px" mt={1}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="step" tick={{ fontSize: 9, fill: "#8a7663" }} interval={4} stroke="#eadccb" />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} labelFormatter={(s) => `time step ${s}`} />
          <Bar dataKey="licit" name="legitimate" stackId="a" fill="#d8c7b1" isAnimationActive={false} />
          <Bar dataKey="illicit" name="fraud" stackId="a" fill="#c2410c" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

function Preview({ ex }: { ex: Exchange }) {
  const d = ex.data;
  if (!d) return <Text fontSize="13px" color="var(--muted)" mt={3}>No data yet. Generate it or upload a CSV.</Text>;
  const labels = labelsFor(d, ex.quality, 1);
  const st = statsOf(d);
  const shown = Array.from({ length: Math.min(6, d.rows) }, (_, i) => i);
  return (
    <Box mt={3} p={3} borderRadius="12px" bg="var(--panel-2)">
      <Text fontSize="13px" fontWeight={650}>
        {st.labeled.toLocaleString()} labeled transactions · {pct(st.illicit / Math.max(1, st.labeled))} truly fraudulent
        {d.source === "uploaded" ? ` · from ${d.fileName}` : " · generated"}
      </Text>
      {d.steps && <><Text fontSize="11px" color="var(--muted)" mt={1}>Transactions by time step, as this exchange labels them (red = fraud)</Text><StepChart ex={ex} /></>}
      <Box as="table" w="100%" mt={2} fontSize="12px" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--muted)", textAlign: "left" }}><th>tx_id</th><th>time step</th><th>label as held</th></tr>
        </thead>
        <tbody>
          {shown.map((i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
              <td style={{ padding: "3px 0" }}><code>{d.txIds[i]}</code></td>
              <td>{d.steps ? d.steps[i] : "—"}</td>
              <td style={{ color: labels[i] !== d.cleanLabels[i] ? "#c2410c" : undefined }}>
                {labels[i] === 1 ? "fraud" : labels[i] === 0 ? "legitimate" : "unlabeled"}{labels[i] !== d.cleanLabels[i] ? " (wrong)" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

export default function ExchangeEditor({ ex, onClose, onUpdate, onRegenerate, onRemove, locked }: {
  ex: Exchange | null;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Exchange>) => void;
  onRegenerate: (id: string, spec: GenSpec) => void;
  onRemove: (id: string) => void;
  locked: boolean;
}) {
  const [tab, setTab] = useState(0);
  const [spec, setSpec] = useState<GenSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ex) return;
    setTab(ex.data?.source === "uploaded" ? 1 : 0);
    setSpec(ex.data?.spec ?? { ...KIND_DEFAULTS[ex.kind], hotSteps: [3, 11, 19], seed: 1 });
    setErr(null);
  }, [ex?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ex || !spec) return null;
  const regen = (s: GenSpec) => {
    setSpec(s);
    onRegenerate(ex.id, s);
  };
  const load = async (get: () => Promise<NonNullable<Exchange["data"]>>) => {
    setBusy(true);
    setErr(null);
    try {
      onUpdate(ex.id, { data: await get() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: "18px", bgcolor: "var(--panel)" } }}>
      <DialogTitle sx={{ pb: 0, fontWeight: 750 }}>Exchange data</DialogTitle>
      <DialogContent>
        <Grid templateColumns="1fr 1fr" gap={3} mt={2}>
          <TextField size="small" label="Name" value={ex.name} disabled={locked} onChange={(e) => onUpdate(ex.id, { name: e.target.value })} />
          <Select size="small" value={ex.kind} disabled={locked} onChange={(e) => {
            const kind = e.target.value;
            onUpdate(ex.id, { kind });
            if (ex.data?.source !== "uploaded") regen({ ...spec, ...KIND_DEFAULTS[kind] });
          }}>
            {KINDS.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
          </Select>
        </Grid>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 2, minHeight: 36, "& .MuiTab-root": { textTransform: "none", minHeight: 36 } }}>
          <Tab label="Generate transactions" />
          <Tab label="Upload a CSV" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <Label>TRANSACTIONS: {spec.size.toLocaleString()}</Label>
            <Slider size="small" min={500} max={8000} step={250} value={spec.size} disabled={locked}
              onChange={(_, v) => setSpec({ ...spec, size: v as number })} onChangeCommitted={(_, v) => regen({ ...spec, size: v as number })} />
            <Label>FRAUD REACHING THIS VENUE: {pct(spec.illicitRate, 0)}</Label>
            <Slider size="small" min={0.01} max={0.4} step={0.01} value={spec.illicitRate} disabled={locked}
              onChange={(_, v) => setSpec({ ...spec, illicitRate: v as number })} onChangeCommitted={(_, v) => regen({ ...spec, illicitRate: v as number })} />
            <Label>SCAM WAVES THAT CASH OUT HERE (TIME STEPS, TWO WEEKS EACH)</Label>
            <Flex wrap="wrap" gap="4px">
              {Array.from({ length: TRAIN_STEPS }, (_, k) => k + 1).map((s) => {
                const on = spec.hotSteps.includes(s);
                return (
                  <button key={s} disabled={locked} onClick={() => regen({ ...spec, hotSteps: on ? spec.hotSteps.filter((x) => x !== s) : [...spec.hotSteps, s].sort((a, b) => a - b) })}
                    style={{ width: 30, height: 26, borderRadius: 6, fontSize: 11, border: "1px solid var(--line)", background: on ? "#c2410c" : "var(--panel)", color: on ? "#fff" : "var(--ink-2)" }}>
                    {s}
                  </button>
                );
              })}
            </Flex>
            <Button size="small" startIcon={<Casino />} disabled={locked} sx={{ mt: 1.5, textTransform: "none" }}
              onClick={() => regen({ ...spec, seed: Math.floor(Math.random() * 1e9) })}>
              Draw a different sample
            </Button>
            <Text fontSize="11px" color="var(--muted)" lineHeight={1.5}>
              Draws real labeled Bitcoin transactions (Elliptic, time steps 1–30) to match this profile. No two exchanges get the same transaction.
            </Text>
          </Box>
        )}

        {tab === 1 && (
          <Box mt={2}>
            <Button variant="contained" disableElevation startIcon={<UploadFile />} disabled={busy || locked} onClick={() => file.current?.click()}
              sx={{ textTransform: "none", borderRadius: "10px", bgcolor: "var(--accent)", "&:hover": { bgcolor: "#c4612f" } }}>
              Upload transactions (CSV)
            </Button>
            <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(async () => parseCsv(await f.text(), await loadSchema(), f.name));
              e.target.value = "";
            }} />
            <Flex align="center" gap={2} mt={2}>
              <Text fontSize="12px" color="var(--muted)" flexShrink={0}>or a sample export:</Text>
              <Select size="small" displayEmpty value="" disabled={busy || locked} sx={{ fontSize: 13, minWidth: 180 }}
                onChange={(e) => {
                  const s = e.target.value as string;
                  if (s) void load(async () => fetchSample(s, await loadSchema()));
                }}>
                <MenuItem value="" disabled sx={{ fontSize: 13 }}>Pick a file</MenuItem>
                {SAMPLES.map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{cap(s)}.csv</MenuItem>)}
              </Select>
            </Flex>
            <Text fontSize="12px" color="var(--ink-2)" mt={2} lineHeight={1.6}>
              One row per transaction: <code>tx_id</code>, <code>is_illicit</code> (1 = fraud, 0 = legitimate) and the consortium's 64 agreed features.
              Values are binned in your browser and never uploaded anywhere.{" "}
              <a href={`${SAMPLE_BASE}template.csv`} download style={{ color: "var(--accent)" }}>Download the template</a>
            </Text>
            {busy && <Text fontSize="12px" color="var(--muted)" mt={2}>Reading and binning locally…</Text>}
            {err && <Text fontSize="12px" color="#c2410c" mt={2}>{err}</Text>}
          </Box>
        )}

        <Label>GETS PAID TO</Label>
        <ToggleButtonGroup exclusive size="small" value={ex.payout.kind} disabled={locked}
          onChange={(_, v) => v && v !== ex.payout.kind && onUpdate(ex.id, { payout: v === "claim" ? { kind: "claim", wallet: newClaimWallet() } : { kind: "address", address: "" } })}>
          <ToggleButton value="claim" sx={{ textTransform: "none", px: 2 }}>No wallet yet: claim link</ToggleButton>
          <ToggleButton value="address" sx={{ textTransform: "none", px: 2 }}>Our wallet address</ToggleButton>
        </ToggleButtonGroup>
        {ex.payout.kind === "claim" ? (
          <Text fontSize="12px" color="var(--muted)" mt={1} lineHeight={1.5}>
            AUSD goes to a fresh claim wallet ({ex.payout.wallet.address.slice(0, 6)}…{ex.payout.wallet.address.slice(-4)}) plus a little ETH for gas.
            After the payout you get a link to send this exchange; whoever opens it withdraws to any address. No wallet or crypto needed beforehand.
          </Text>
        ) : (
          <TextField size="small" fullWidth placeholder="0x… (Ethereum Sepolia)" sx={{ mt: 1 }} disabled={locked}
            value={ex.payout.address} error={!!ex.payout.address && !isAddress(ex.payout.address)}
            helperText={ex.payout.address && !isAddress(ex.payout.address) ? "Not a valid address" : "Any EVM address works, including an exchange deposit address."}
            onChange={(e) => onUpdate(ex.id, { payout: { kind: "address", address: e.target.value.trim() as `0x${string}` } })} />
        )}

        <Label>DATA QUALITY</Label>
        <ToggleButtonGroup exclusive size="small" value={ex.quality} disabled={locked} onChange={(_, v) => v && onUpdate(ex.id, { quality: v })}>
          {QUALITY.map(([q, label]) => (
            <ToggleButton key={q} value={q} sx={{ textTransform: "none", px: 2, ...(q === "compromised" ? { "&.Mui-selected": { bgcolor: "rgba(194,65,12,.12)", color: "#c2410c" } } : {}) }}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Text fontSize="12px" color={ex.quality === "compromised" ? "#c2410c" : "var(--muted)"} mt={1} lineHeight={1.5}>
          {QUALITY.find(([q]) => q === ex.quality)![2]}
        </Text>

        <Preview ex={ex} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: "space-between" }}>
        <Button color="error" disabled={locked} sx={{ textTransform: "none" }} onClick={() => { onRemove(ex.id); onClose(); }}>Remove exchange</Button>
        <Button variant="contained" disableElevation onClick={onClose} sx={{ textTransform: "none", borderRadius: "10px", bgcolor: "var(--ink)" }}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
