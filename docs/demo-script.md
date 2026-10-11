# Tessera: 2-minute demo script (draft)

Status: draft. No recording yet; the user said no video work for now.
Target: 1:55, about 280 spoken words at a calm pace. Each row lists what's on screen and what you say.

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:15 | Title card: logo + "Get paid for what your data is worth, without sharing it." | "The data that catches money laundering is locked inside exchanges that can't share it. A scam cashes out through a dozen venues, and each one sees only its own slice. Tessera turns that locked data into a market." |
| 0:15–0:40 | **Data market** tab. Add four exchanges, generate each one's data from a business profile (offshore exchange, regulated custodian, ...). Open one and upload a sample CSV. | "Each company joins the consortium with its own data. Here they're built from real labeled Bitcoin transactions, or you can upload your own CSV. That data never leaves the company. Only model updates do: this is federated learning." |
| 0:40–0:55 | Open one exchange, set data quality to **Compromised**, click Run. The skyline animates each round: packets travel the roads to the coordinator tower; the compromised building goes dark with a red beacon and its packets stop at a red shield. | "One member is sending poisoned updates. Watch what happens as we train." |
| 0:55–1:15 | Results: payout list. Compromised member shows "rejected" and 0; the others split the pool in AUSD. Optional, if time allows: "Pay them for real" → MetaMask → one tx pays everyone; open a claim link to show "your data earned this". | "Every round, we measure exactly how much each member's update improved the model, using Shapley values over every combination of members. The poisoned member is rejected every round and earns zero. Everyone else is paid for what their data actually added." |
| 1:15–1:25 | **Benchmark** results chart: 70.3% consortium vs 67.2% best solo vs 40% undefended. | "On real data, the consortium catches 70% of illicit transactions at a 1% false-alarm rate. That's better than any exchange alone and as good as pooling all the raw data. Without our defense, one attacker drops it to 40%." |
| 1:25–1:45 | **Ledger**: run #0 → BscScan tx → back, **Replay & verify**, hashes tick to green → click "Paid 1,000 AUSD on Ethereum Sepolia ↗" → Etherscan settlement tx showing AUSD transfers (attacker gets none). | "Every run is committed on BNB Chain with its model hashes and payout split. Training is bit-for-bit deterministic, so anyone can replay a run and check every hash. Then the pool pays out in real AUSD, Agora's stablecoin, using exactly that split. Verified, not trusted." |
| 1:45–1:55 | **Use the model**: upload new-transactions.csv, alert list appears, click download. Then end card: live URL + repo. | "Members then use the model they built to screen their own transactions. Anti-money-laundering is our first market. Card fraud, credit risk and insurance claims are next. This is Tessera." |

## Recording notes
- Do a dry run of the Data market tab first so the dataset is cached and the run doesn't stall on camera.
- Line up the BscScan tab ahead of time: https://testnet.bscscan.com/address/0x751199289a537366a6f56f2c54fb4d5938221ea3
- And the run #0 AUSD settlement: https://sepolia.etherscan.io/tx/0x03306ad666afd5128340e2bbcd5ee1f87a4aa86170a59329d6f17dc783da2241
- For the optional "Pay them for real" beat: have MetaMask on Sepolia with test AUSD and a little ETH beforehand, and the claim link copied, so it's one click on camera.
- Read the Data market payout numbers off the screen. Don't script them; they depend on the exchanges you build.
- If you're short on time, cut the CSV upload (0:15–0:40) first. Never cut the Compromised beat or the Replay & verify beat: they're the proof.
