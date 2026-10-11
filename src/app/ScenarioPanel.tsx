import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { FormControlLabel, MenuItem, Select, Slider, Switch, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { EXCHANGES } from "../engine/data";
import { MAX_LABS, type AttackType, type RunConfig } from "../engine/federation";
import { epsilon } from "../engine/privacy";

const ATTACKS: [AttackType, string, string][] = [
  ["signFlip", "Model poisoning", "sends a boosted update pointing the wrong way"],
  ["labelFlip", "Whitelist my flows", "trains on inverted labels so laundering looks clean"],
  ["noise", "Garbage updates", "free-rider sending random weights"],
];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <Box mt={4}>
      <Flex justify="space-between" align="baseline">
        <Text fontSize="12px" fontWeight={650} color="var(--ink-2)">{label}</Text>
        {hint && <Text fontSize="11px" color="var(--muted)">{hint}</Text>}
      </Flex>
      {children}
    </Box>
  );
}

export default function ScenarioPanel({ cfg, onChange, disabled }: { cfg: RunConfig; onChange: (c: RunConfig) => void; disabled: boolean }) {
  const attack = cfg.attacks[0] ?? null;
  const robust = cfg.aggregator !== "fedavg" && cfg.filterAnomalies;
  const set = (p: Partial<RunConfig>) => onChange({ ...cfg, ...p });
  const setLabs = (n: number) =>
    set({ numLabs: n, attacks: cfg.attacks.filter((a) => a.lab < n) });

  return (
    <Box p={5} borderRadius="16px" bg="var(--panel)" border="1px solid var(--line)" mb={4} opacity={disabled ? 0.6 : 1}
      pointerEvents={disabled ? "none" : "auto"}>
      <Text fontSize="11px" letterSpacing=".12em" fontWeight={700} color="var(--muted)">SCENARIO</Text>

      <Row label="Exchanges in the consortium" hint={`${cfg.numLabs}`}>
        <Slider size="small" value={cfg.numLabs} min={3} max={MAX_LABS} step={1} marks onChange={(_, v) => setLabs(v as number)} />
      </Row>

      <Row label="Training rounds" hint={`${cfg.rounds}`}>
        <Slider size="small" value={cfg.rounds} min={4} max={20} step={1} onChange={(_, v) => set({ rounds: v as number })} />
      </Row>

      <Row label="Malicious exchange">
        <Select size="small" fullWidth value={attack ? String(attack.lab) : "none"} sx={{ mt: 0.5, fontSize: 14 }}
          onChange={(e) => {
            const v = e.target.value;
            set({ attacks: v === "none" ? [] : [{ lab: Number(v), type: attack?.type ?? "signFlip" }] });
          }}>
          <MenuItem value="none">Nobody (all honest)</MenuItem>
          {EXCHANGES.slice(0, cfg.numLabs).map((x, i) => (
            <MenuItem key={x.name} value={String(i)}>{x.name} · {x.kind}</MenuItem>
          ))}
        </Select>
        {attack && (
          <Select size="small" fullWidth value={attack.type} sx={{ mt: 1, fontSize: 14 }}
            onChange={(e) => set({ attacks: [{ lab: attack.lab, type: e.target.value as AttackType }] })}>
            {ATTACKS.map(([k, name, what]) => (
              <MenuItem key={k} value={k}>
                <Box>
                  <Text fontSize="14px">{name}</Text>
                  <Text fontSize="11px" color="var(--muted)">{what}</Text>
                </Box>
              </MenuItem>
            ))}
          </Select>
        )}
      </Row>

      <Row label="Coordinator defense">
        <ToggleButtonGroup exclusive size="small" fullWidth value={robust ? "robust" : "fedavg"} sx={{ mt: 0.5 }}
          onChange={(_, v) => v && set(v === "robust" ? { aggregator: "trimmed", filterAnomalies: true } : { aggregator: "fedavg", filterAnomalies: false })}>
          <ToggleButton value="robust" sx={{ textTransform: "none" }}>Screen + trimmed mean</ToggleButton>
          <ToggleButton value="fedavg" sx={{ textTransform: "none" }}>Plain FedAvg</ToggleButton>
        </ToggleButtonGroup>
      </Row>

      <Row label="Differential privacy on updates" hint={cfg.dp.enabled ? `ε ≈ ${epsilon(cfg.dp.noiseMultiplier, cfg.rounds).toExponential(1)} (δ=1e-5)` : "off"}>
        <FormControlLabel sx={{ ml: 0, mt: 0.5 }}
          control={<Switch size="small" checked={cfg.dp.enabled} onChange={(e) => set({ dp: { ...cfg.dp, enabled: e.target.checked } })} />}
          label={<Text fontSize="13px" color="var(--ink-2)" ml={1}>Clip each update and add Gaussian noise before it leaves the exchange</Text>} />
        {cfg.dp.enabled && (
          <Slider size="small" value={cfg.dp.noiseMultiplier} min={0.002} max={0.05} step={0.002}
            onChange={(_, v) => set({ dp: { ...cfg.dp, noiseMultiplier: v as number } })} valueLabelDisplay="auto" />
        )}
      </Row>

      <Row label="Seed" hint="same seed ⇒ bit-identical run">
        <Slider size="small" value={cfg.seed} min={1} max={50} step={1} onChange={(_, v) => set({ seed: v as number })} valueLabelDisplay="auto" />
      </Row>
    </Box>
  );
}
