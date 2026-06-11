// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GameConfig
 * @dev Single source of truth for all tunables. Not behind a proxy — upgrading the
 *      config means deploying a new GameConfig and calling setCombatSim/setGameConfig
 *      on the proxy. Owned by the same Safe/timelock that owns the proxies.
 */
contract GameConfig is Ownable {
    uint256 public levelUpFee      = 0.001 ether;
    uint256 public breedFee        = 0.0005 ether;
    uint256 public baseMintFee     = 0.001 ether;
    uint256 public battleCooldown  = 5 seconds;
    uint256 public maxNameLength   = 32;

    address public combatSim;

    event LevelUpFeeUpdated(uint256 fee);
    event BreedFeeUpdated(uint256 fee);
    event BaseMintFeeUpdated(uint256 fee);
    event CombatSimUpdated(address sim);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setLevelUpFee(uint256 fee) external onlyOwner {
        levelUpFee = fee;
        emit LevelUpFeeUpdated(fee);
    }

    function setBreedFee(uint256 fee) external onlyOwner {
        breedFee = fee;
        emit BreedFeeUpdated(fee);
    }

    function setBaseMintFee(uint256 fee) external onlyOwner {
        baseMintFee = fee;
        emit BaseMintFeeUpdated(fee);
    }

    function setCombatSim(address sim) external onlyOwner {
        require(sim != address(0), "Zero address");
        combatSim = sim;
        emit CombatSimUpdated(sim);
    }
}
