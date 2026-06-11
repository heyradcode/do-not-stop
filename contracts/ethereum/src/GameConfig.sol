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
    uint256 public levelUpFee          = 0.001 ether;
    uint256 public breedFee            = 0.0005 ether;
    uint256 public baseMintFee         = 0.001 ether;
    uint256 public battleCooldown      = 5 seconds;
    uint256 public breedCooldownBase   = 5 seconds;   // doubles per breedCount (§4.1)
    uint256 public newbornCooldown     = 60 seconds;  // bred pets: battle lockout after birth (§4.2)
    uint256 public maxNameLength       = 32;
    uint8   public generationCap       = 20;          // max child generation (§4.1)

    uint256 public trainFee            = 0.001 ether; // level-scaled: baseFee * (100 + 2*L) / 100 (§3.4)
    uint256 public trainCooldown       = 60 seconds;  // per-pet train lockout (§5 dev: 60s, prod: 24h)
    uint32  public trainXp             = 100;         // flat XP per train (§3.4)

    uint32  public maxLevel            = 100;         // hard cap; no XP/level-up beyond this (§3.4)
    uint32  public levelBandWidth      = 100;         // ±N level gap allowed for battle (§3.4 dev: 100=off, prod: 10)

    address public combatSim;

    event LevelUpFeeUpdated(uint256 fee);
    event BreedFeeUpdated(uint256 fee);
    event BaseMintFeeUpdated(uint256 fee);
    event BreedCooldownBaseUpdated(uint256 cooldown);
    event NewbornCooldownUpdated(uint256 cooldown);
    event GenerationCapUpdated(uint8 cap);
    event TrainFeeUpdated(uint256 fee);
    event TrainCooldownUpdated(uint256 cooldown);
    event TrainXpUpdated(uint32 xp);
    event MaxLevelUpdated(uint32 level);
    event LevelBandWidthUpdated(uint32 width);
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

    function setBreedCooldownBase(uint256 cooldown) external onlyOwner {
        breedCooldownBase = cooldown;
        emit BreedCooldownBaseUpdated(cooldown);
    }

    function setNewbornCooldown(uint256 cooldown) external onlyOwner {
        newbornCooldown = cooldown;
        emit NewbornCooldownUpdated(cooldown);
    }

    function setGenerationCap(uint8 cap) external onlyOwner {
        require(cap > 0, "Cap must be > 0");
        generationCap = cap;
        emit GenerationCapUpdated(cap);
    }

    function setTrainFee(uint256 fee) external onlyOwner {
        trainFee = fee;
        emit TrainFeeUpdated(fee);
    }

    function setTrainCooldown(uint256 cooldown) external onlyOwner {
        trainCooldown = cooldown;
        emit TrainCooldownUpdated(cooldown);
    }

    function setTrainXp(uint32 xp) external onlyOwner {
        trainXp = xp;
        emit TrainXpUpdated(xp);
    }

    function setMaxLevel(uint32 level) external onlyOwner {
        require(level > 0, "Max level must be > 0");
        maxLevel = level;
        emit MaxLevelUpdated(level);
    }

    function setLevelBandWidth(uint32 width) external onlyOwner {
        levelBandWidth = width;
        emit LevelBandWidthUpdated(width);
    }

    function setCombatSim(address sim) external onlyOwner {
        require(sim != address(0), "Zero address");
        combatSim = sim;
        emit CombatSimUpdated(sim);
    }
}
