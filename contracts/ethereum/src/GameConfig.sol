// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";


/**
 * @title GameConfig
 * @dev Single source of truth for all tunables. Not behind a proxy — upgrading the
 *      config means deploying a new GameConfig and calling setGameConfig
 *      on the proxy. Owned by the same Safe/timelock that owns the proxies.
 */
contract GameConfig is Ownable {
    uint256 public levelUpFee          = 0.004 ether; // level-scaled: baseFee * (100 + (L-1)^2) / 100, capped at maxLevel; 1->99 total > train's 1->99 total
    uint256 public breedFee            = 0.0005 ether;
    uint256 public baseMintFee         = 0.001 ether;
    // `battleFee` and `battleCooldown` were removed with the on-chain battle path (§L Phase
    // 6): the first funded settleBattle's gas and the second fed PetCore.triggerCooldown,
    // and neither exists any more. Backend battles carry no per-battle transaction, and their
    // cooldown is BATTLE_COOLDOWN_SECONDS in the backend. GameConfig is not behind a proxy,
    // so dropping the fields is a redeploy rather than a layout hazard.
    uint256 public breedCooldownBase   = 3600 seconds;  // doubles per breedCount, capped at 30 days (§4.1: 1h base)
    uint256 public newbornCooldown     = 43200 seconds; // bred pets: battle lockout after birth (§4.2: 12h)
    uint256 public maxNameLength       = 32;
    uint8   public generationCap       = 20;          // max child generation (§4.1)

    uint256 public trainFee            = 0.001 ether; // level-scaled: baseFee * (100 + 2*L) / 100 (§3.4)
    uint256 public trainCooldown       = 60 seconds;  // per-pet train lockout (§5 dev: 60s, prod: 24h)
    uint32  public trainXp             = 100;         // flat XP per train (§3.4)

    uint32  public maxLevel            = 100;         // hard cap; no XP/level-up beyond this (§3.4)

    uint256 public studFee             = 0.001 ether; // cross-owner breed: payer → other parent's owner (§4.4)
    uint256 public marriageCooldown    = 60 seconds;  // lockout after divorce/stale (§5 dev: 60s, prod: 24h)
    uint256 public proposalTTL         = 60 seconds;  // marriage proposal expiry (§5 dev: 60s, prod: 7 days)

    // Species pool sizes per rarity tier (1-5); speciesId = digitPair % poolSizes[rarity] (§3.7).
    mapping(uint8 => uint8) public poolSizes;

    // Skill archetype balance values (§3.7). Owner-tunable, but nothing reads them: they
    // parameterized the on-chain simulator, and the live values now travel in the backend's
    // signed ruleset (`protocol/src/ruleset/`) so a receipt names the balance it was fought
    // under. Kept as tunables pending a decision on where balance should live.
    uint16 public tankHpMult       = 120;  // Tank: ×/100 HP
    uint16 public shellDefMult     = 125;  // Shell: ×/100 DEF
    uint16 public swiftCritBonus   = 50;   // Swift: + bps to crit base
    uint16 public cunningCritCap   = 4000; // Cunning: crit cap bps
    uint16 public furyDmgMult      = 130;  // Fury: ×/100 dmg when triggered
    uint16 public furyHpThreshold  = 3000; // Fury: trigger threshold, bps of startHP
    uint16 public sageMdefMult     = 125;  // Sage: ×/100 MDEF
    uint16 public bloodlustBps     = 150;  // Bloodlust: bps of physical dmg healed

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
    event StudFeeUpdated(uint256 fee);
    event MarriageCooldownUpdated(uint256 cooldown);
    event ProposalTTLUpdated(uint256 ttl);
    event PoolSizeUpdated(uint8 tier, uint8 size);
    event TankHpMultUpdated(uint16 value);
    event ShellDefMultUpdated(uint16 value);
    event SwiftCritBonusUpdated(uint16 value);
    event CunningCritCapUpdated(uint16 value);
    event FuryDmgMultUpdated(uint16 value);
    event FuryHpThresholdUpdated(uint16 value);
    event SageMdefMultUpdated(uint16 value);
    event BloodlustBpsUpdated(uint16 value);

    constructor(address initialOwner) Ownable(initialOwner) {
        for (uint8 t = 1; t <= 5; t++) {
            poolSizes[t] = 8;
        }
    }

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


    function setStudFee(uint256 fee) external onlyOwner {
        studFee = fee;
        emit StudFeeUpdated(fee);
    }

    function setMarriageCooldown(uint256 cooldown) external onlyOwner {
        marriageCooldown = cooldown;
        emit MarriageCooldownUpdated(cooldown);
    }

    function setProposalTTL(uint256 ttl) external onlyOwner {
        proposalTTL = ttl;
        emit ProposalTTLUpdated(ttl);
    }

    function setPoolSize(uint8 tier, uint8 size) external onlyOwner {
        require(tier >= 1 && tier <= 5, "Invalid tier");
        poolSizes[tier] = size;
        emit PoolSizeUpdated(tier, size);
    }

    function setTankHpMult(uint16 value) external onlyOwner {
        tankHpMult = value;
        emit TankHpMultUpdated(value);
    }

    function setShellDefMult(uint16 value) external onlyOwner {
        shellDefMult = value;
        emit ShellDefMultUpdated(value);
    }

    function setSwiftCritBonus(uint16 value) external onlyOwner {
        swiftCritBonus = value;
        emit SwiftCritBonusUpdated(value);
    }

    function setCunningCritCap(uint16 value) external onlyOwner {
        cunningCritCap = value;
        emit CunningCritCapUpdated(value);
    }

    function setFuryDmgMult(uint16 value) external onlyOwner {
        furyDmgMult = value;
        emit FuryDmgMultUpdated(value);
    }

    function setFuryHpThreshold(uint16 value) external onlyOwner {
        furyHpThreshold = value;
        emit FuryHpThresholdUpdated(value);
    }

    function setSageMdefMult(uint16 value) external onlyOwner {
        sageMdefMult = value;
        emit SageMdefMultUpdated(value);
    }

    function setBloodlustBps(uint16 value) external onlyOwner {
        bloodlustBps = value;
        emit BloodlustBpsUpdated(value);
    }
}
