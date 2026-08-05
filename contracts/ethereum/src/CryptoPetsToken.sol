// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title CryptoPetsToken
 * @notice The CPET reward token. Fixed supply, minted once at deployment.
 * @dev Funds `SeasonRewardDistributor` (docs/battle-protocol.md §I).
 *
 *      **There is no mint function, and no owner.** §I's whole argument is that rewards are
 *      bounded: the distributor caps what one wallet and one season may pay, and those caps
 *      bound what a bad root can cost. A token that could be minted later would leave the
 *      real ceiling as "whatever the key holder decides", which makes the on-chain caps a
 *      statement about arithmetic rather than about supply. Fixing it here means the total
 *      is checkable by anyone, forever, without trusting anybody to refrain.
 *
 *      The cost of that is real and deliberate: seasons must be funded from a supply that
 *      already exists, so running out means running out. That is the intended failure —
 *      a season that cannot be funded is refused before its root is posted
 *      (`season.open.ts` checks the distributor's balance), which is a far better outcome
 *      than paying early claimants and reverting on the rest.
 *
 *      Ownable is deliberately absent for the same reason. With supply fixed and no
 *      privileged transfer path, an owner would hold authority over nothing, and an
 *      owner key that controls nothing is a key that can still be stolen and still cause
 *      alarm. Distribution is a matter of moving tokens the deployer already holds.
 *
 *      Not upgradeable, for the obvious reason: a reward token whose rules can be rewritten
 *      is not a fixed supply.
 */
contract CryptoPetsToken is ERC20 {
    error InvalidHolder();
    error InvalidSupply();

    /**
     * @param initialHolder Receives the entire supply. Expected to be the treasury that
     *                      funds each season's distributor balance, not the distributor
     *                      itself — the distributor should hold only what an open season
     *                      can pay.
     * @param initialSupply Total supply, in wei (18 decimals). Fixed forever at this value.
     */
    constructor(address initialHolder, uint256 initialSupply) ERC20("CryptoPets", "CPET") {
        if (initialHolder == address(0)) revert InvalidHolder();
        // A zero supply would deploy a token that can never pay a season, and would only be
        // discovered when the first season was refused for underfunding.
        if (initialSupply == 0) revert InvalidSupply();
        _mint(initialHolder, initialSupply);
    }
}
