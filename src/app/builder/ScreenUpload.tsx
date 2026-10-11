import { useRef, useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Button } from "@mui/material";
import UploadFile from "@mui/icons-material/UploadFile";
import { datasetFromBins } from "../../engine/data";
import { shapeOf, type RunConfig } from "../../engine/federation";
import { predict } from "../../engine/model";
import { download, loadSchema, parseCsv, SAMPLE_BASE } from "./csv";
import { pct } from "../palette";

interface Screened {
  fileName: string;
  rows: { txId: string; score: number; alert: boolean }[];
  alerts: number;
}

/** A member puts the shared model to work on its own fresh transactions, locally. */
export default function ScreenUpload({ params, cfg, threshold }: { params: Float64Array; cfg: RunConfig; threshold: number }) {
  const file = useRef<HTMLInputElement>(null);
  const [out, setOut] = useState<Screened | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const screen = async (name: string, text: Promise<string>) => {
    setErr(null);
    try {
      const schema = await loadSchema();
      const d = parseCsv(await text, schema, name, false);
      const ds = datasetFromBins(d.bins, d.cleanLabels, schema.features, schema.nBins);
      const probs = predict(params, shapeOf(cfg, ds), ds, [...ds.labels.keys()]);
      const rows = d.txIds.map((txId, i) => ({ txId, score: probs[i], alert: probs[i] >= threshold })).sort((a, b) => b.score - a.score);
      setOut({ fileName: name, rows, alerts: rows.filter((r) => r.alert).length });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Box p={6} borderRadius="16px" bg="var(--panel)" border="1px solid var(--accent)">
      <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--accent)">SCREEN YOUR OWN TRANSACTIONS</Text>
      <Text fontSize="20px" fontWeight={700} mt={1}>Run today's transactions through the consortium's model</Text>
      <Text fontSize="14px" color="var(--ink-2)" mt={1} lineHeight={1.6}>
        Upload a CSV in the shared schema (no labels needed). Scoring happens in your browser; the file goes nowhere.
        You get an alert list at the same 1% false-alarm threshold, ready to hand to your compliance team.
      </Text>
      <Flex gap={3} mt={3} wrap="wrap">
        <Button variant="contained" disableElevation startIcon={<UploadFile />} onClick={() => file.current?.click()}
          sx={{ textTransform: "none", borderRadius: "10px", bgcolor: "var(--accent)", "&:hover": { bgcolor: "#c4612f" } }}>
          Upload transactions (CSV)
        </Button>
        <Button variant="outlined" sx={{ textTransform: "none", borderRadius: "10px" }}
          onClick={() => void screen("new-transactions.csv", fetch(`${SAMPLE_BASE}new-transactions.csv`).then((r) => r.text()))}>
          Try a sample batch of 1,000 new transactions
        </Button>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void screen(f.name, f.text());
          e.target.value = "";
        }} />
      </Flex>
      {err && <Text fontSize="13px" color="#c2410c" mt={3}>{err}</Text>}
      {out && (
        <Box mt={4}>
          <Text fontSize="15px" fontWeight={700}>
            {out.rows.length.toLocaleString()} transactions screened from {out.fileName}: <span style={{ color: "#c2410c" }}>{out.alerts} alerts</span> ({pct(out.alerts / out.rows.length)})
          </Text>
          <Box as="table" w="100%" mt={2} fontSize="13px" style={{ borderCollapse: "collapse" }}>
            <thead><tr style={{ color: "var(--muted)", textAlign: "left" }}><th>tx_id</th><th>risk score</th><th>decision</th></tr></thead>
            <tbody>
              {out.rows.slice(0, 8).map((r) => (
                <tr key={r.txId} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "4px 0" }}><code>{r.txId}</code></td>
                  <td>{pct(r.score, 2)}</td>
                  <td style={{ color: r.alert ? "#c2410c" : "var(--green)", fontWeight: 650 }}>{r.alert ? "Alert: review" : "Clear"}</td>
                </tr>
              ))}
            </tbody>
          </Box>
          <Button size="small" sx={{ mt: 2, textTransform: "none" }}
            onClick={() => download(`alerts-${out.fileName}`, ["tx_id,risk_score,alert", ...out.rows.map((r) => `${r.txId},${r.score.toFixed(5)},${r.alert ? 1 : 0}`)].join("\n"))}>
            Download all {out.rows.length.toLocaleString()} scores (CSV)
          </Button>
        </Box>
      )}
      <Text fontSize="11px" color="var(--muted)" mt={3}>
        Schema: <a href={`${SAMPLE_BASE}template.csv`} download style={{ color: "var(--accent)" }}>template.csv</a>
      </Text>
    </Box>
  );
}
