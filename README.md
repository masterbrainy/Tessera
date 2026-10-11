# Tessera

**A market where companies get paid for what their private data is worth, without ever sharing it.** Contributors train a shared model; their data never moves, only model updates do. Each one is paid by exactly how much its data improved the model (exact Shapley values, settled onchain), bad data is caught and earns nothing, and the finished model goes back to work for its members. The first live market is anti-money-laundering across crypto exchanges; the same mechanism fits card fraud, credit risk and insurance claims.

**Live app:** https://masterbrainy.github.io/Tessera/ (training runs in your browser, nothing to install)

**Onchain (BSC testnet):** [TesseraLedger `0x7511…1ea3`](https://testnet.bscscan.com/address/0x751199289a537366a6f56f2c54fb4d5938221ea3) · reference runs committed by the distributed coordinator: [defended](https://testnet.bscscan.com/tx/0x52b64909a3b6a3286d9ad9cb5831d819ce1ea31ba07acafc093f057fc7888c00), [plain FedAvg under attack](https://testnet.bscscan.com/tx/0x847c072916a6f103c4e17be25eac081156a2c5e67676a05078a063ed2a6ccbcf), [with differential privacy](https://testnet.bscscan.com/tx/0xc5a50c9f7211ca8d8295f441ac3f068620c16aeee74c0d7e7e6cd63ae0a8eae1)

**Payouts (Ethereum Sepolia, real Agora AUSD):** [TesseraPayouts `0xd7dd…7f89`](https://sepolia.etherscan.io/address/0xd7ddbbd3468821878bdf5fe2f39e5b9820bf7f89) · each committed run paid 1,000 AUSD: [run #0](https://sepolia.etherscan.io/tx/0x03306ad666afd5128340e2bbcd5ee1f87a4aa86170a59329d6f17dc783da2241), [run #1](https://sepolia.etherscan.io/tx/0xc6e5768a0239586062a0a914d86bca0b33e997b29e123c726430185998ed91fc), [run #2](https://sepolia.etherscan.io/tx/0x7dd513999832b38a4a47835aaab975d583272134e28e16a2ef8ea7dd5055249b)

Built at B@BHacks 2.0 for **Most Technically Impressive** and the **YZi Labs** track (programmable capital, trusted agent infrastructure).

---

## Try the data market

1. Open the [live app](https://masterbrainy.github.io/Tessera/). Three exchanges are already in the market, each with its own transaction history.
2. **Add an exchange**, or click one to edit its data. Either **generate** its history from a business profile (venue type, number of transactions, how much illicit flow reaches it, which scam waves cash out there), or **upload a CSV** export ([template](public/samples/template.csv), [sample exports](public/samples/)). Uploaded values are binned in the browser and never leave it.
3. Set any exchange's data quality to **Compromised** (every label inverted, as if a breached pipeline or an insider marked illicit flows clean) and press **Train and pay out**. Its updates get rejected, it earns 0 AUSD, and the others split the 1,000 AUSD pool by contribution.
4. **Use the model**: upload today's transactions (or the sample batch) and download an alert list scored by the model the market paid for.

## The bottleneck

Illicit crypto flow is fragmented. One scam wave cashes out through an offshore exchange, a ransomware crew through an OTC desk, a mule network through crypto ATMs. **Each venue sees only part of the pattern.** Privacy law, competition and customer trust keep them from pooling transaction data, so every compliance team trains on its own slice and misses what its peers already saw.

Federated learning fixes the data problem: share what you *learned*, not what you *hold*. But two problems keep consortia like this from forming in the real world:

1. **Trust:** a single malicious or compromised member can poison the shared model.
2. **Incentives:** why would a big exchange contribute if a small one free-rides? Who gets paid, and how much?

Tessera handles both and settles the answer onchain.

## What it does

| Step | How |
|---|---|
| **Data stays home** | Each exchange holds its own labeled transactions in an isolated Web Worker (browser) or its own server process (`node/lab-server.ts`, real HTTP). Only weight deltas (~33k floats) ever leave. |
| **Local training** | Sparse multi-task MLP trained with Adam on 64 quantile-binned transaction features. |
| **Poisoning defense** | Each update is compared with the coordinate-wise median of all updates (an attacker minority can't move it). Low cosine or abnormal magnitude gets screened out, and the rest are combined with a coordinate-wise trimmed mean. |
| **Exact contribution pricing** | Every round, the model is rebuilt from **all 2ⁿ coalitions** of exchanges and scored on a consortium validation window, giving exact Shapley values (not an approximation). |
| **Onchain settlement** | `TesseraLedger` (BSC testnet) records the config, the keccak fingerprint of the model after every round, and every exchange's per-round Shapley value and payout split. `TesseraPayouts` (Ethereum Sepolia) then pays each committed run once, in real AUSD, pro rata to that split. |
| **Trustless audit** | All math on the training path is bit-exact across JS engines: custom `exp`/`log` built from IEEE-exact ops, a seeded xoshiro RNG, fixed reduction order. **Anyone can replay a committed run in their browser from its config alone and check every model fingerprint and every payout.** |
| **Optional DP** | Client-side clipping plus Gaussian noise, with an RDP ε accountant. |

## Results (real data, nothing hard-coded)

Data: the [Elliptic Bitcoin dataset](https://www.kaggle.com/datasets/ellipticco/elliptic-data-set): 46,564 real Bitcoin transactions labeled illicit or licit across 49 time steps. Steps 1–30 are split across exchanges (non-IID: different sizes, and each scam wave concentrates at one venue). Steps 31–34 are the consortium's validation window, and **all metrics are on steps 35–49, future weeks no one trained on.**

"Catch rate" = share of illicit transactions flagged when only 1% of licit ones trigger false alarms.

| Setup (5 exchanges, 10 rounds, seed 7) | Catch rate | ROC-AUC |
|---|---|---|
| Best single exchange, alone | 67.2% | 0.921 |
| Other exchanges, alone | 63.8–67.1% | 0.898–0.912 |
| **Tessera consortium** (one attacker present, defended) | **70.3%** | 0.915 |
| Pool all raw data (privacy-violating ceiling) | 70.1% | 0.918 |
| One poisoning exchange, **plain FedAvg** (no defense) | 40.0% | 0.787 |

The consortium matches the "share everything" ceiling without sharing anything. The attacker is rejected in every round and earns **0 AUSD**. A big but low-signal regulated custodian earns less than a smaller offshore venue that sees more illicit flow: **paid for value added, not volume.**

Reproduce: `npx tsx node/experiment.ts '{}' baselines` and `npx tsx node/experiment.ts '{"aggregator":"fedavg","filterAnomalies":false}'`.

## Benchmark run (replay-verifiable onchain)

1. Open **Benchmark** in the [live app](https://masterbrainy.github.io/Tessera/) and press **Run the consortium**. Watch updates travel the vines and see the malicious exchange's update stopped at the coordinator.
2. Change the scenario: pick a different attacker or attack type ("whitelist my flows" label flipping, garbage updates), switch the defense to plain FedAvg and watch the model collapse, or turn on DP.
3. Click any exchange for its round-by-round screening scores and Shapley values.
4. **Ledger** lists runs committed onchain. Press **Replay & verify** to re-train in your browser and match every fingerprint.
5. **Screen a transaction** uses the consortium model on future, unseen transactions.

## Run it locally

```bash
pnpm install
pnpm dev                                   # app at http://localhost:5173/Tessera/
pnpm test                                  # determinism, Shapley efficiency, robust aggregation
npx tsx node/coordinator.ts --spawn        # real distributed mode: one HTTP process per exchange
npx tsx node/coordinator.ts --spawn --submit   # ...and commit the run to BSC testnet (needs DEPLOYER_KEY in .env)
pnpm compile && pnpm deploy                # compile + deploy TesseraLedger (solc-js, viem)
.venv/bin/python scripts/preprocess.py     # rebuild public/data/elliptic.json from the raw Elliptic CSVs
```

## Architecture

```
src/engine/      pure TypeScript, identical in Node and every browser
  detmath.ts     deterministic exp/log (Math.exp/log/pow are not bit-exact across engines)
  rng.ts         xoshiro128** + Marsaglia polar gaussian
  data.ts        dataset decode, exchange profiles, non-IID partition
  model.ts       sparse MLP + Adam
  aggregate.ts   FedAvg / trimmed mean / median + median-referenced screening
  shapley.ts     exact Shapley over all coalitions
  privacy.ts     clip + Gaussian noise, RDP epsilon
  federation.ts  labUpdate (what an exchange does), coordinate (one round), runFederation, payouts
  hash.ts        keccak model fingerprints, canonical config JSON
src/workers/     one Web Worker per exchange (benchmark + data-market providers) + coordinator + baselines + replay
src/app/builder/ data market: exchange data generator, CSV upload + binning, run loop, payouts, screen-your-own CSV
src/app/         React UI (Chakra + MUI + framer-motion): 3D isometric skyline (Skyline.jsx), design system from our earlier project Bloom
src/chain/       viem client for TesseraLedger, generated ABI, deployment
contracts/       TesseraLedger.sol (BSC run ledger) + TesseraPayouts.sol (AUSD settlement on Ethereum Sepolia)
node/            lab-server (per-exchange HTTP node), coordinator CLI, deploy, experiments
```

## What's next

- Secure aggregation (pairwise masking), so even the coordinator never sees an individual update, with Shapley computed under MPC.
- Exchanges stake to join, and the stake is slashed when an update is screened out.
- Pay-per-query: outside parties pay AUSD to score a transaction against the consortium model, and revenue streams to members by Shapley share.
- Graph features (Elliptic's transaction graph) and travel-rule-compatible identity credentials for members.
