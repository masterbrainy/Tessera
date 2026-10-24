# Tessera: shared context for every Claude session on this repo

Hackathon: B@BHacks 2.0 (Blockchain at Berkeley). Deadline is ~4h from 2026-10-11 13:40 local.
Tracks: **Most Technically Impressive** (general) + **YZi Labs** sponsor track ("solves a real
bottleneck, team could keep building it"; Binance-affiliated). Judges are finance/startup/blockchain
people, so the framing is **finance**, not medical.

## Pitch (updated 2026-10-11 by the user, this framing wins)
A **market where companies get paid for what their private data is worth, without sharing it**. Not "we
train a model": contributors are paid by contribution (Shapley), bad data earns 0, and the trained model is then
used for good (members screen their own transactions for scams/fraud). Crypto fraud and scams is the first live market
(reframed from AML on 2026-10-14); AML, card fraud, credit risk and insurance claims use the same mechanism.

Original AML framing, still accurate for the first market: Crypto exchanges / VASPs each see only a slice of illicit flow (scam waves cash out through
different venues), but can't share customer transaction data (privacy, competition, regulation).
Tessera lets them train one anti-money-laundering model together: only weight updates leave each
exchange. The coordinator screens out poisoned updates, prices every exchange's contribution with
exact Shapley values, and commits the run onchain (BSC testnet). A reward pool in AUSD is paid
pro rata to contribution. Training is bit-for-bit deterministic, so anyone can replay a committed
run in their browser and verify every round's model hash: payouts are auditable, not trusted.

## Data
Elliptic Bitcoin dataset (real tx, 46,564 labeled illicit/licit, 49 time steps).
`scripts/preprocess.py` → `public/data/elliptic.json` (64 most informative features, 8 quantile bins
each → 512 sparse input bits). Temporal split: steps 1–30 spread across exchanges, 31–34 consortium
validation window (used only for Shapley scoring), 35–49 future test window (all reported metrics).
Headline metric: **catch rate** = share of illicit tx flagged at a 1% false-alarm rate; plus ROC-AUC.

## Measured results (default config, seed 7, 5 exchanges, 10 rounds)
- Consortium: AUC 0.915, catch rate 70.3% (attacker present but filtered); 0.9175 / 69.9% with no attacker
- Each exchange alone: catch rate 63.8–67.2%; pooling all raw data (privacy-violating ceiling): 70.1%
- One poisoning exchange with plain FedAvg (no defense): catch rate collapses to 40%, AUC 0.79
- With defense (median-referenced cosine screening + trimmed mean): attacker flagged every round, payout 0

## Architecture
- `src/engine/` pure TS, runs identically in Node and browsers (no DOM).
  - `detmath.ts` deterministic exp/log (Math.exp/log/pow are NOT bit-exact across engines; never use them on the weight path)
  - `rng.ts` xoshiro128** + polar gaussian; `data.ts` dataset parse + `EXCHANGES` profiles + non-IID partition
  - `model.ts` sparse multi-task MLP + Adam; `aggregate.ts` fedavg/trimmed/median + screening
  - `shapley.ts` exact Shapley over all 2^n coalitions; `privacy.ts` optional client DP + RDP epsilon
  - `federation.ts` RunConfig, `labUpdate` (what an exchange does), `coordinate` (one round), `runFederation`, baselines, payouts
  - `hash.ts` keccak of params (float64 LE) + canonical JSON
- `src/workers/` Web Workers: one per exchange (`lab.worker`), `coordinator.worker`, `baseline.worker` (solo + pooled curves), `replay.worker` (verification)
- `src/app/` React UI ported from github.com/visheshv5/bloom (Chakra v2 + MUI v6 + framer-motion, Inter). Visual is a 3D isometric skyline (`Skyline.jsx`): exchanges = buildings, coordinator = central tower, updates = packets on roads.
- `src/chain/` `abi.ts` (generated), `ledger.ts` (commit/fetch runs, keyless deterministic exchange payout addresses), `deployment.json`
- `contracts/TesseraLedger.sol` ledger + `ConsortiumUSD` (cUSD) reward token. `pnpm compile` (solc-js) regenerates `src/chain/abi.ts`.
- `node/` real distributed mode: `lab-server.ts` (one HTTP process per exchange), `coordinator.ts --spawn [--submit]`, `chain/deploy.ts`, `experiment.ts` (tuning sweeps)

## Commands
- `pnpm dev` / `pnpm build` (Vite, base `/Tessera/` for GitHub Pages)
- `npx tsx node/experiment.ts '{"aggregator":"fedavg","filterAnomalies":false}' baselines`
- `npx tsx node/coordinator.ts --spawn --config '{"rounds":3}' [--submit]`
- `pnpm compile && pnpm deploy` (needs tBNB on the deployer in `.env`, address 0x6bc4047aFC6D9aFf13f3e51627CB35075fa7ddc1)

## Deploy target
GitHub Pages (only `gh` is authenticated on this machine; no Vercel/Fly/etc). Public repo under `masterbrainy`.

## Status (update as you go)
- LIVE: https://masterbrainy.github.io/Tessera/ (GitHub Actions deploys on every push to main; runs `pnpm test` + `pnpm build`)
- REPO: https://github.com/masterbrainy/Tessera (public)
- DONE: data, engine, distributed HTTP mode, contract + compile, deploy script, workers, full bloom-style UI (skyline, scenario, results, payouts, commit card, exchange dialog, how-it-works, ledger + replay verify, screen-a-transaction), 7 vitest tests, README
- VERIFIED: browser and Node produce the same final model hash for the default config (0x0451f9b6…)
- ONCHAIN: TesseraLedger 0x751199289a537366a6f56f2c54fb4d5938221ea3, cUSD 0x2A001a150DECF58B9e2d3cFC4b299959cc39E121 (BSC testnet). Runs #0 defended, #1 plain FedAvg under attack, #2 DP, all committed by `node/coordinator.ts --spawn --submit`. Deployer has ~0.00025 tBNB left (~5 more commits at 0.1 gwei).
- DONE (15:40): **Data market** is the default tab (`src/app/builder/`): add exchanges, generate each one's data from a
  profile (real Elliptic rows drawn to match size / illicit share / hot scam waves, no row shared) or upload a CSV
  (`public/samples/*.csv`, template), mark data Clean / Noisy / Compromised, train + pay out (12 rounds default,
  screening cos 0.3). Compromised exchange is rejected and earns 0. "Use the model" page screens an uploaded CSV.
  Old simulation = "Benchmark" tab (unchanged, onchain/replay). Multi-laptop rooms were built then dropped (user).
- TODO: demo video (user said not yet), submission text (Plan & Pivot session) must use the data-market pitch

## Parallel sessions: coordination rules
- **Main build session** owns: `src/app/**`, `src/workers/**`, `src/chain/**`, `node/**`, `contracts/**`.
- **Side plan/pivot session** owns: `docs/**` (pitch, demo script, submission copy, judging strategy), and may
  edit anything else after messaging the main session first. Work on your own branch; the main session merges.
- Record any decision that changes framing, scope, or architecture in **Decisions log** below and message the
  other session (use `ListAgents` to find it, then `SendMessage`).
- Engine determinism is load-bearing (onchain verification). Don't add `Math.exp/log/pow/sin` on the weight path.

## Decisions log
- 2026-10-11: Track = Most Technically Impressive + YZi Labs. Chain = BSC testnet.
- 2026-10-11: Pivoted domain from drug discovery (Tox21) to finance/AML (Elliptic) because judges are finance/blockchain.
- 2026-10-11: UI copies bloom's design system exactly (user request).
- 2026-10-11: Pitch = data market (paid for private data's worth, without sharing); AML is market #1. UI default tab = Data market builder.
- 2026-10-11: Static deploy (GitHub Pages); all training runs client-side in Web Workers, plus Node distributed mode for the "real network" story.
- 2026-10-11: Payouts settle in real Agora AUSD on **Ethereum Sepolia** (AUSD isn't on BSC). Hybrid: BSC testnet stays the verification ledger; `TesseraPayouts` 0xd7ddbbd3468821878bdf5fe2f39e5b9820bf7f89 (Sepolia) is a funded pool (`fund`), and coordinator-only `settle(bscRunId, finalModelHash, amount, labs, bps)` pays each committed BSC run once. BSC runs #0–#2 settled at 1,000 AUSD each (addresses + tx in `src/chain/payouts.json`). Script: `npx tsx node/chain/settle-ausd.ts [--chain sepolia|base-sepolia]` (coordinator wallet = PAYOUT_KEY in .env, 0x363914B66e9DfD2EeC2f45F6395DB726ee0E8c76).
- 2026-10-11: Cut cUSD from all user-facing copy (user). Payouts are AUSD only (TesseraPayouts, Ethereum Sepolia, 1,000 AUSD per committed run); Ledger earnings read `totalEarned` there. The BSC contract still mints cUSD internally; don't mention it in UI, README or submission.
