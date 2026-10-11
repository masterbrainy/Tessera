// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// Lets anyone who funds a data-market run (a sponsor, a model buyer) pay every contributor its
/// Shapley share in one transaction, straight from the sponsor's wallet. Contributors without a
/// wallet are paid to a claim wallet, and the sponsor can drop a little ETH there so the claim
/// link's holder can withdraw without owning any gas.
contract TesseraPayoutRouter {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    event RunPaid(
        bytes32 indexed runRef, address indexed sponsor, address token, uint256 amount, address[] recipients, uint16[] payoutBps
    );

    /// `runRef` is the final model fingerprint of the run being paid. Requires `amount` approved to this contract.
    /// Rounding dust is never pulled from the sponsor. `msg.value` is split evenly across `gasDrop`.
    function pay(
        IERC20 token,
        bytes32 runRef,
        uint256 amount,
        address[] calldata recipients,
        uint16[] calldata payoutBps,
        address[] calldata gasDrop
    ) external payable {
        require(recipients.length > 0 && recipients.length == payoutBps.length, "bad lengths");
        uint256 sum;
        for (uint256 i = 0; i < payoutBps.length; i++) sum += payoutBps[i];
        require(sum == BPS, "payout must sum to 10000 bps");

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 share = (amount * payoutBps[i]) / BPS;
            if (share > 0) token.safeTransferFrom(msg.sender, recipients[i], share);
        }

        if (msg.value > 0) {
            require(gasDrop.length > 0, "no gas recipients");
            uint256 each = msg.value / gasDrop.length;
            for (uint256 i = 0; i < gasDrop.length; i++) {
                (bool ok,) = gasDrop[i].call{value: each}("");
                require(ok, "gas drop failed");
            }
            uint256 dust = msg.value - each * gasDrop.length;
            if (dust > 0) {
                (bool ok,) = msg.sender.call{value: dust}("");
                require(ok, "refund failed");
            }
        }
        emit RunPaid(runRef, msg.sender, address(token), amount, recipients, payoutBps);
    }
}
