# Tessera: product requirements

**One line:** a market where companies get paid for what their private data is worth, without ever sharing it.
**First market:** crypto fraud and scams (reframed from AML on 2026-10-14; AML is a next market).
**Status:** hackathon build (B@BHacks 2.0, 2026-10-11). Live at https://masterbrainy.github.io/Tessera/.
Requirements below are tagged **Shipped** (in the live build, verified) or **Planned** (roadmap).

---

## 1. Problem

The data that best catches fraud and money laundering is split across companies that aren't allowed to pool it.

- **Signal is fragmented.** A scam wave cashes out through many exchanges. Each one sees a slice, and none sees
  the pattern.
- **Sharing is blocked.** Privacy law, banking secrecy and competition rule out sending customer transactions to a
  shared database.
- **Data has no price.** Even where collaboration happens, nobody can say how much each participant's data
  contributed, so there's no fair way to pay for it. Big participants get credit for volume and small,
  high-signal participants get nothing.
- **Shared models can be poisoned.** One bad or compromised participant can wreck a jointly trained model, and in
  a paid system, that participant would be paid for it.

## 2. Users

| User | Need | What Tessera gives them |
|---|---|---|
| **Data contributor** (exchange, OTC desk, payments app) | Earn from its data without exposing customers; catch more laundering | Paid by measured contribution; the data never leaves; the shared model screens its own transactions |
| **Model user** (a member, or a smaller venue joining later) | A better detector than it could train alone | Access to the consortium model; funds the reward pool |
| **Verifier** (regulator, auditor, any member) | Proof that training and payouts were done honestly | Every run committed onchain and replayable bit-for-bit in a browser |
| **Coordinator** (Tessera) | Run rounds, reject bad updates, settle payouts | Robust aggregation, exact Shapley scoring, settlement contracts |

## 3. Goals and non-goals

**Goals**
1. A consortium model detects more illicit activity than any single member, with no raw-data sharing.
2. Every contributor is paid in proportion to its measured marginal contribution.
3. Poisoned or useless data earns nothing and can't degrade the model.
4. Anyone can verify a run and its payouts without trusting the coordinator.
5. The same mechanism works in other markets beyond AML.

**Non-goals (for now)**
- Selling or transferring raw datasets.
- Training large or foundation models. The engine targets small tabular models that train in a browser.
- Cryptographic training (MPC or homomorphic encryption). Privacy comes from data locality, plus optional
  differential privacy.
- Mainnet deployment or real-money payouts.

## 4. How the market works

1. **Join.** A member brings labeled data in the shared feature format (in the demo: generated from a business
   profile using real Elliptic rows, or uploaded as CSV).
2. **Train locally.** Each round, members receive the global model, train one pass on their own data, and send back
   only the weight delta.
3. **Screen and aggregate.** The coordinator rejects deltas that point away from the median delta or are abnormally
   large, then combines the rest with a coordinate-wise trimmed mean.
4. **Price each contribution.** For every coalition of members (2^n), the coordinator measures validation
   performance with only that coalition's deltas applied. Exact Shapley values give each member's marginal
   contribution, summed over rounds; anything negative counts as 0.
5. **Commit.** The run's config, per-round model hashes, metrics, Shapley scores and payout split (basis points)
   go to `TesseraLedger` on BSC testnet.
6. **Settle.** `TesseraPayouts` on Ethereum Sepolia pays that run's AUSD pool according to the committed split,
   exactly once per run, recording the BSC run id and final model hash.
7. **Verify.** Anyone replays the run from its committed config. Training is deterministic, so every round hash
   must match.
8. **Use.** Members screen their own transactions with the consortium model and export an alert list.

## 5. Functional requirements

### Federated training
| ID | Requirement | Status |
|---|---|---|
| F1 | Raw data never leaves a member; only weight deltas are transmitted | Shipped |
| F2 | Members run as browser Web Workers, or as separate HTTP server processes (distributed mode) | Shipped |
| F3 | Configurable rounds, local epochs, learning rate, batch size, hidden width, aggregator | Shipped |
| F4 | Aggregators: FedAvg, trimmed mean, coordinate-wise median | Shipped |
| F5 | Optional client-level differential privacy (clipping + Gaussian noise) with an RDP epsilon readout | Shipped |
| F6 | Bit-for-bit deterministic training across browsers and Node (custom exp/log, seeded xoshiro128**) | Shipped |

### Robustness
| ID | Requirement | Status |
|---|---|---|
| R1 | Screen each update against the median update (cosine threshold + norm limit) and drop outliers | Shipped |
| R2 | Simulate attackers (sign flip, label flip, noise) to show the defense working | Shipped |
| R3 | A rejected member earns 0 for that round | Shipped |
| R4 | Challenge window: a run that fails replay can be disputed before settlement | Planned |

### Contribution pricing
| ID | Requirement | Status |
|---|---|---|
| P1 | Exact Shapley values over all coalitions, every round, on a held-out validation window | Shipped |
| P2 | Payout split in basis points summing to exactly 10,000 (largest remainder); non-positive contribution gets 0 | Shipped |
| P3 | Approximate Shapley (Monte Carlo) for consortia too large for 2^n | Planned |

### Onchain
| ID | Requirement | Status |
|---|---|---|
| C1 | `TesseraLedger` (BSC testnet) records config, round hashes, metrics, Shapley scores and payout split per run | Shipped |
| C2 | `TesseraPayouts` (Ethereum Sepolia) holds an AUSD pool; anyone can `fund()` it | Shipped |
| C3 | Coordinator-only `settle()` pays a committed run once, using its committed split | Shipped |
| C4 | Browser "Replay & verify" recomputes every round hash and Shapley score of a committed run | Shipped |
| C5 | Coordinator registry / permissioned `commitRun` on the ledger (anyone can commit today) | Planned |
| C6 | Data market runs paid in AUSD by a sponsor in one transaction via `TesseraPayoutRouter` | Shipped |
| C6b | Data market runs committed to BSC and replayable before payment | Planned |
| C7 | Pay members to their own wallet, or to a claim link (a generated wallet, pre-loaded with gas, whose holder withdraws anywhere) | Shipped |
| C7b | Claim flow without bearer keys in links (e.g. signed claims or email-verified withdrawals) | Planned |

### App
| ID | Requirement | Status |
|---|---|---|
| A1 | Data market tab: add members, generate or upload data, mark it Clean / Noisy / Compromised, train, see payouts | Shipped |
| A2 | Benchmark tab: the reference simulation with solo and pooled baselines | Shipped |
| A3 | Ledger tab: committed runs, BscScan and Etherscan links, replay verification | Shipped |
| A4 | Use the model: screen an uploaded CSV, download alerts | Shipped |
| A5 | Static deploy; all compute on the visitor's machine | Shipped |

## 6. Data

- **Source:** Elliptic Bitcoin dataset. 46,564 labeled transactions (illicit or licit), 165 anonymized features,
  49 time steps.
- **Features:** the 64 most separating features, each split into 8 quantile bins, so every transaction is 64 active
  bits out of 512. Bin edges ship with the data so new CSVs are binned identically.
- **Temporal split:** steps 1–30 are member data; 31–34 are the validation window (Shapley scoring only); 35–49 are
  the future test window (every reported metric).
- **Members:** simulated, non-IID. Each profile sets size and illicit share; for example, an offshore exchange sees
  2.6x the scam share and a regulated custodian much less.
- **Real-world onboarding (Planned):** a published feature spec plus a client that runs inside the member's
  environment. Labels come from existing compliance output (suspicious-activity reports, frozen accounts,
  law-enforcement requests, vendor alerts).

## 7. Success metrics

Measured on the future test window. Catch rate = share of illicit transactions flagged at a 1% false-alarm rate.

| Metric | Target | Measured |
|---|---|---|
| Consortium beats the best single member | > best solo | **70.3%** vs 67.2% |
| Consortium approaches the pooled-data ceiling | within 1 pt | 70.3% vs 70.1–70.5% |
| Defense holds under one poisoning member | no collapse | 70.3% (undefended FedAvg: 40.0%) |
| Attacker payout | 0 | 0 in every committed run |
| Pays for signal, not size | top earner ≠ biggest dataset | Meridian (small, scam-heavy) 38.1%; Atlas (largest) 4.0% |
| Replay reproduces committed hashes | 100% | Run #0: all 10 round hashes match |
| Settlement matches the committed split | exact | Runs #0–#2: 3,000 AUSD paid, attacker 0 |
| Privacy mode cost | small | DP on: 67.4% |

## 8. Architecture

- `src/engine/`: pure TypeScript, identical in browser and Node. Model + Adam, aggregation, screening, Shapley,
  differential privacy, keccak hashing of float64 params.
- `src/workers/`: one Web Worker per member, plus coordinator, baseline and replay workers.
- `node/`: distributed mode (`lab-server.ts` per member, `coordinator.ts --spawn --submit`), deploy and
  settlement scripts.
- `contracts/`: `TesseraLedger.sol` (BSC testnet, run records), `TesseraPayouts.sol` (Ethereum Sepolia, pool that
  settles committed runs), `TesseraPayoutRouter.sol` (Ethereum Sepolia, sponsor pays a Data market run in one tx).
- `src/app/`: React + Vite, Chakra + MUI, framer-motion, Recharts. Hosted on GitHub Pages.

| Contract | Chain | Address |
|---|---|---|
| TesseraLedger | BSC testnet (97) | `0x751199289a537366a6f56f2c54fb4d5938221ea3` |
| TesseraPayouts | Ethereum Sepolia (11155111) | `0xd7ddbbd3468821878bdf5fe2f39e5b9820bf7f89` |
| TesseraPayoutRouter | Ethereum Sepolia (11155111) | `0x3078af1ec055e2851807cd2b32463e5c2a6a4286` |
| AUSD (Agora testnet) | Ethereum Sepolia | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` |

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Fake runs committed to the ledger (open `commitRun`) | Misleading records | Replay exposes them; Planned: coordinator registry (C5) + challenge window (R4) |
| Gradient leakage from weight deltas | Partial privacy loss | Optional DP (F5); Planned: secure aggregation |
| Honest-but-unusual members rejected by screening | Unfair 0 payout | Median-referenced screening tuned on non-IID members; rejection is visible per round |
| Shapley cost grows as 2^n | Doesn't scale past ~10 members | Planned: Monte Carlo Shapley (P3) |
| Claim links are bearer keys | Whoever holds the link can withdraw | Testnet only; Planned: signed or verified claims (C7b) |
| Router pays whatever split the sponsor submits | Unverified Data market payouts | Planned: commit to BSC first (C6b) |
| Coordinator is a trusted operator for settlement | Wrong payouts | Settlement must match the committed split; anyone can replay before trusting it |
| Two chains (record on BSC, pay on Sepolia) | Linkage is by run id + hash, not a bridge | Each settlement cites the BSC run id and final model hash; Planned: single-chain settlement once AUSD is on BNB Chain |
| Simulated members | Results may not transfer to real exchanges | Pilot with real members on a shared feature spec |

## 10. Roadmap

1. **Close the money loop.** Model users pay per screened transaction or by subscription into the AUSD pool.
2. **Trust minimization.** Permissioned commits, a challenge window, commit-before-pay for Data market runs, safer claims.
3. **Scale.** Monte Carlo Shapley, secure aggregation, larger models.
4. **Pilot.** 3–5 exchanges on a shared feature spec, with an on-prem member client.
5. **New markets, same engine.** Card and payments fraud, credit risk, insurance claims fraud.

## 11. Open questions

- Who governs the validation window that prices contributions? It sets every payout.
- Should model users pay per query, per seat, or by staking?
- Does a member that joins later get paid for past rounds?
- Which jurisdictions' regulators would accept replay verification as an audit trail?
