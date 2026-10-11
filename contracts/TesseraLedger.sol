// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test stablecoin the consortium pays contributors in.
contract ConsortiumUSD is ERC20 {
    address public immutable ledger;

    constructor(address ledger_) ERC20("Consortium USD", "cUSD") {
        ledger = ledger_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == ledger, "only ledger");
        _mint(to, amount);
    }
}

/// @title TesseraLedger
/// @notice Public record of federated training runs between exchanges. Each run commits
/// the exact config, the hash of the global model after every round, every exchange's
/// Shapley contribution per round, and pays out a reward pool pro rata to contribution.
/// Training is bit-for-bit deterministic, so anyone can replay a run from its config
/// and check every committed model hash: payouts are auditable, not trusted.
contract TesseraLedger {
    struct Run {
        address coordinator;
        bytes32 configHash;
        bytes32 finalModelHash;
        uint32 rounds;
        uint32 numLabs;
        uint32 finalAucE6;
        uint32 finalCatchRateE6;
        uint64 timestamp;
        uint64 blockNumber;
    }

    uint256 public constant POOL_PER_RUN = 10_000e18;
    uint16 public constant BPS = 10_000;

    ConsortiumUSD public immutable cusd;
    Run[] public runs;
    mapping(address => uint256) public totalEarned;

    event RunCommitted(
        uint256 indexed runId,
        address indexed coordinator,
        bytes32 configHash,
        bytes32 finalModelHash,
        string config,
        bytes32[] roundHashes,
        uint32[] aucE6,
        uint32[] catchRateE6,
        int64[] shapleyE9,
        address[] labs,
        uint16[] payoutBps
    );
    event Payout(uint256 indexed runId, address indexed lab, uint256 amount);

    constructor() {
        cusd = new ConsortiumUSD(address(this));
    }

    /// @param shapleyE9 per-round per-lab contribution, flattened [round * numLabs + lab], scaled 1e9.
    function commitRun(
        string calldata config,
        bytes32[] calldata roundHashes,
        uint32[] calldata aucE6,
        uint32[] calldata catchRateE6,
        int64[] calldata shapleyE9,
        address[] calldata labs,
        uint16[] calldata payoutBps
    ) external returns (uint256 runId) {
        uint256 r = roundHashes.length;
        uint256 n = labs.length;
        require(r > 0 && n > 1, "empty run");
        require(aucE6.length == r && catchRateE6.length == r, "metrics length");
        require(shapleyE9.length == r * n, "shapley length");
        require(payoutBps.length == n, "payout length");
        uint256 sum;
        for (uint256 i = 0; i < n; i++) sum += payoutBps[i];
        require(sum == BPS || sum == 0, "payout must sum to 10000 bps");

        bytes32 configHash = keccak256(bytes(config));
        runId = runs.length;
        runs.push(
            Run({
                coordinator: msg.sender,
                configHash: configHash,
                finalModelHash: roundHashes[r - 1],
                rounds: uint32(r),
                numLabs: uint32(n),
                finalAucE6: aucE6[r - 1],
                finalCatchRateE6: catchRateE6[r - 1],
                timestamp: uint64(block.timestamp),
                blockNumber: uint64(block.number)
            })
        );
        emit RunCommitted(
            runId, msg.sender, configHash, roundHashes[r - 1], config, roundHashes, aucE6, catchRateE6, shapleyE9, labs, payoutBps
        );

        for (uint256 i = 0; i < n; i++) {
            if (payoutBps[i] == 0) continue;
            uint256 amount = (POOL_PER_RUN * payoutBps[i]) / BPS;
            totalEarned[labs[i]] += amount;
            cusd.mint(labs[i], amount);
            emit Payout(runId, labs[i], amount);
        }
    }

    function runCount() external view returns (uint256) {
        return runs.length;
    }
}
