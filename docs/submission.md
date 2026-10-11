# Tessera: submission copy

Paste-ready text for the hackathon platform. Every number below is from the committed BSC testnet runs
(Benchmark tab) or the README results table. Don't quote Data market tab numbers: they change with whatever
exchanges the viewer builds.

- Live app: https://masterbrainy.github.io/Tessera/
- Repo: https://github.com/masterbrainy/Tessera
- Run ledger (BSC testnet): https://testnet.bscscan.com/address/0x751199289a537366a6f56f2c54fb4d5938221ea3
- AUSD payout pool (Ethereum Sepolia): https://sepolia.etherscan.io/address/0xd7ddbbd3468821878bdf5fe2f39e5b9820bf7f89
- Tracks: Most Technically Impressive, YZi Labs

---

## Name
Tessera

## Tagline (one line)
A market where companies get paid for what their private data is worth, without ever sharing it.

## Short description (~50 words)
Tessera lets companies that can't share data train one model together and get paid for what their data
contributed. Raw data never leaves each company; only model updates do. Every contribution is priced with exact
Shapley values, bad or poisoned data earns 0, runs are committed on BSC testnet where anyone can replay and
verify them, and contributors are paid in Agora's AUSD stablecoin. First market: crypto anti-money-laundering.

## The problem
The most valuable data for catching fraud and money laundering is locked inside companies that are not allowed
to share it. Each crypto exchange sees only its own slice of illicit flow: a scam wave cashes out through a
dozen venues, and no single one sees the pattern. Pooling the data would catch more, but privacy law, banking
secrecy and competition make that a non-starter. So the data sits idle, and the companies holding it get no
value from it.

## What Tessera does
Tessera is a market for what private data knows, not for the data itself.

1. **Contribute without sharing.** Each member trains the shared model on its own data, on its own machine,
   using federated learning. Only weight updates leave.
2. **Get paid by contribution.** After every round the coordinator measures how much each member's update
   improved the model on a held-out validation window, using exact Shapley values over every coalition of
   members. The reward pool is split in proportion and paid in AUSD, Agora's dollar stablecoin.
3. **Bad data earns nothing.** Updates that point away from the consensus are screened out, and the remaining
   ones are combined with a trimmed mean. A poisoning member is rejected every round and paid 0.
4. **Verify, don't trust.** Each run's config, per-round model hashes, Shapley scores and payout split are committed
   to a BSC testnet contract. Training is bit-for-bit deterministic, so anyone can replay a
   committed run in their browser and check every hash.
5. **Get paid in real stablecoins.** A funded AUSD pool (`TesseraPayouts`, Ethereum Sepolia) settles each committed
   run exactly once, using the split recorded on BSC and citing that run's id and final model hash. Anyone can
   top up the pool with `fund()`; only the coordinator can settle.
6. **Use the model.** Members screen their own transactions with the model they helped train and download an
   alert list.

## Results (real Bitcoin data, Elliptic dataset, 5-member consortium)
Catch rate = share of illicit transactions flagged at a 1% false-alarm rate, measured on a future time window no
one trained on.

| Setup | Catch rate |
|---|---|
| Tessera consortium (attacker present, filtered out) | **70.3%** (AUC 0.915) |
| Best single exchange alone | 67.2% |
| Pooling all raw data (privacy-violating ceiling) | 70.1–70.5% |
| Plain federated averaging with one poisoning member | 40.0% |
| Tessera with differential privacy on | 67.4% |

**Paid for signal, not size.** In committed run #0, Atlas (the largest dataset, but little illicit flow) earns
4.0% of the pool, while Meridian (smaller, but full of scam flow) earns 38.1%. The poisoning member, Lumen, earns
0%.

## How we built it
- **Engine, from scratch in TypeScript (no ML library).** A sparse neural network with an Adam optimizer, federated
  aggregation (FedAvg, trimmed mean, median), anomaly screening, exact Shapley over all 2^n coalitions, and
  optional differential privacy with an RDP epsilon accountant. The same code runs in browsers and in Node.
- **Determinism.** Custom exp/log and a seeded xoshiro128** generator make training bit-identical across
  engines. That's what makes onchain replay verification possible: the browser and the Node coordinator produce
  the same final model hash.
- **Two ways to run.** In the browser, each member is a Web Worker. In distributed mode, each member is a
  separate HTTP server process and the coordinator talks to them over the network. The committed reference runs
  came from distributed mode.
- **Contracts.** Solidity, deployed with viem. `TesseraLedger` on BSC testnet records every run (hashes, Shapley,
  payout split). `TesseraPayouts` on Ethereum Sepolia holds an AUSD pool (Agora's testnet token) and pays each
  committed run once, with OpenZeppelin SafeERC20. Committed runs #0–#2 are settled: 3,000 AUSD paid, attacker 0.
- **App.** React + Vite, Chakra UI + MUI, framer-motion, Recharts. A static site on GitHub Pages: all training
  runs on the visitor's machine.
- **Data.** The Elliptic Bitcoin dataset (46,564 labeled transactions), preprocessed in Python into 64 features x
  8 bins and split by time into member data, a validation window for scoring, and a future test window.

## Challenges
- **Determinism across engines.** `Math.exp` and `Math.log` aren't bit-exact across JavaScript engines, so we
  wrote our own. Without that, replaying a run wouldn't reproduce the committed hashes.
- **Pricing contribution fairly.** Payouts by data size reward volume, not value. Exact Shapley over every
  coalition is expensive, so we score on a small validation window each round to keep it fast enough for a
  browser.
- **Robust aggregation vs. honest diversity.** Members genuinely differ (an offshore exchange sees far more scam
  flow than a regulated custodian), so the screening has to reject poison without rejecting unusual honest data.

## What's next
- **Close the money loop.** Model users pay per screened transaction or by subscription into the AUSD pool,
  which already exists (`fund()`); today we fund it from Agora's testnet faucet.
- **Permissioned commits and challenges.** A coordinator registry plus a challenge window, so a run that fails
  replay can be disputed before payouts finalize.
- **More markets on the same engine.** Card and payments fraud, credit risk, insurance claims fraud: anywhere the
  signal is spread across companies that can't pool their data.
- **Pilot.** A shared feature spec and a small client that runs inside a member's environment, starting with a
  handful of exchanges.

## Why YZi Labs
Binance and every other exchange face the same bottleneck: the data that would catch laundering is spread across
competitors who can't share it. Tessera turns that data into a paid, verifiable contribution instead of a
liability, it records every run on BNB Chain, and the engine extends to every market where data can't move.

## Honest scope (say it before a judge asks)
- The 5 exchanges are simulated from one public dataset (real labeled Bitcoin transactions, split unevenly).
- The AUSD pool is funded from Agora's testnet faucet, not by model-user fees yet.
- The BSC ledger also mints a cUSD token as an onchain record of each split (Benchmark tab). The real payouts are
  the AUSD settlements on Ethereum Sepolia.
- Payouts on the Data market tab are computed in the browser; the onchain commitments and replay are on the
  Benchmark tab.
- Anyone can call `commitRun` today. Replay exposes a bad run, but nothing blocks it from being posted.
