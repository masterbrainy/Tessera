// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// AUSD settlement for runs committed to TesseraLedger on BSC testnet.
/// Model users fund the pool; the coordinator settles each verified BSC run once, paying every
/// contributor its Shapley share of `amount` in AUSD. The BSC run id and final model hash are
/// recorded with every settlement, so anyone can replay that run and check the payout matches.
contract TesseraPayouts {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    IERC20 public immutable ausd;
    address public immutable coordinator;

    mapping(uint256 => bool) public settled;
    mapping(address => uint256) public totalEarned;
    uint256 public totalFunded;
    uint256 public totalPaid;

    event Funded(address indexed from, uint256 amount);
    event Settled(
        uint256 indexed bscRunId, bytes32 finalModelHash, uint256 amount, address[] labs, uint16[] payoutBps
    );
    event Paid(uint256 indexed bscRunId, address indexed lab, uint256 amount);

    constructor(IERC20 ausd_) {
        ausd = ausd_;
        coordinator = msg.sender;
    }

    /// Anyone (a model user, a sponsor) can top up the reward pool. Requires prior AUSD approval.
    function fund(uint256 amount) external {
        require(amount > 0, "zero amount");
        ausd.safeTransferFrom(msg.sender, address(this), amount);
        totalFunded += amount;
        emit Funded(msg.sender, amount);
    }

    function poolBalance() external view returns (uint256) {
        return ausd.balanceOf(address(this));
    }

    /// Pay out one committed BSC run. `payoutBps` must match the run's onchain payout split.
    /// Rounding dust stays in the pool for the next run.
    function settle(
        uint256 bscRunId,
        bytes32 finalModelHash,
        uint256 amount,
        address[] calldata labs,
        uint16[] calldata payoutBps
    ) external {
        require(msg.sender == coordinator, "only coordinator");
        require(!settled[bscRunId], "run already settled");
        require(labs.length > 1 && labs.length == payoutBps.length, "bad lengths");
        require(amount > 0 && amount <= ausd.balanceOf(address(this)), "pool too small");

        uint256 sum;
        for (uint256 i = 0; i < payoutBps.length; i++) sum += payoutBps[i];
        require(sum == BPS, "payout must sum to 10000 bps");

        settled[bscRunId] = true;
        emit Settled(bscRunId, finalModelHash, amount, labs, payoutBps);

        uint256 paid;
        for (uint256 i = 0; i < labs.length; i++) {
            if (payoutBps[i] == 0) continue;
            uint256 share = (amount * payoutBps[i]) / BPS;
            paid += share;
            totalEarned[labs[i]] += share;
            ausd.safeTransfer(labs[i], share);
            emit Paid(bscRunId, labs[i], share);
        }
        totalPaid += paid;
    }
}
