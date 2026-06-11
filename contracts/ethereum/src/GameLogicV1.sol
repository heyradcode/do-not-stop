// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IVRFCoordinatorV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

import "./PetCoreV1.sol";
import "./GameConfig.sol";
import "./CombatSimV1.sol";
import "./DnaLib.sol";

/**
 * @title GameLogicV1
 * @dev UUPS-upgradeable contract holding all game mechanics: battle, breed, VRF handling.
 *
 *      Both battle and breed use the store-then-settle pattern (plan §3.5):
 *        requestBattle / requestCreateFromDNA  → VRF request, store pending record
 *        rawFulfillRandomWords                 → store VRF seed only (150k gas, safe)
 *        settleBattle / settleBreed            → run sim / mix DNA, apply results
 *      This makes a failed settle retryable and keeps states symmetric across EVM/Solana.
 */
contract GameLogicV1 is UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {

    // ─── events ───────────────────────────────────────────────────────────────

    event BreedRandomnessRequested(
        address indexed owner,
        uint256 indexed requestId,
        uint256 petId1,
        uint256 petId2
    );
    event BreedSettled(address indexed owner, uint256 indexed childId, uint256 indexed requestId);

    event BattleRandomnessRequested(
        address indexed requester,
        uint256 indexed requestId,
        uint256 petId1,
        uint256 petId2
    );
    event BattleResolved(
        uint256 indexed requestId,
        uint256 indexed winnerId,
        uint256 indexed loserId,
        uint256 vrfSeed,
        bool    firstWins,
        uint8   rounds,
        uint16  winnerHpRemaining,
        uint32  xpWin,
        uint32  xpLoss
    );

    event Trained(uint256 indexed petId, uint32 xpGained, uint32 newXp, uint32 newLevel);

    // ─── structs ──────────────────────────────────────────────────────────────

    struct BreedRequest {
        address owner;
        uint256 petId1;
        uint256 petId2;
        string  name;
        uint256 vrfSeed;
        bool    fulfilled;
    }

    struct PendingBattle {
        address requester;
        uint256 petId1;
        uint256 petId2;
        uint256 vrfSeed;
        bool    fulfilled;
    }

    enum RequestType { None, Breed, Battle }

    // ─── storage (layout append-only) ────────────────────────────────────────

    PetCoreV1                public petCore;
    GameConfig               public gameConfig;
    IVRFCoordinatorV2Plus    public s_vrfCoordinator;
    // Stored separately so rawFulfillRandomWords can check msg.sender without inheriting
    // VRFConsumerBaseV2Upgradeable (dual-Initializable conflict with Chainlink's vendored OZ).
    address                  private _rawVrfCoordinator;

    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    bool    public vrfNativePayment;

    // Callback stores the VRF word only — 150k gas is sufficient (plan §3.5).
    uint32  private constant VRF_CALLBACK_GAS_LIMIT    = 150_000;
    uint16  private constant VRF_REQUEST_CONFIRMATIONS = 3;
    uint32  private constant VRF_NUM_WORDS             = 1;

    mapping(uint256 => BreedRequest)   private s_breedRequests;
    mapping(uint256 => uint256)        public  petBreedRequestId;

    mapping(uint256 => RequestType)    private s_requestTypes;
    mapping(uint256 => PendingBattle)  private s_battleRequests;
    mapping(uint256 => uint256)        public  petBattleRequestId;

    // Reserve 37 slots: 11 declared above + 37 gap = 48 total.
    uint256[37] private __gap;

    // ─── modifiers ────────────────────────────────────────────────────────────

    modifier onlyPetOwner(uint256 petId) {
        require(petCore.ownerOf(petId) == msg.sender, "Not the owner of this pet");
        _;
    }

    // ─── initializer ──────────────────────────────────────────────────────────

    function initialize(
        address vrfCoordinator_,
        address petCore_,
        address gameConfig_,
        uint256 subscriptionId_,
        bytes32 keyHash_,
        bool    nativePayment_,
        address initialOwner
    ) public initializer {
        __UUPSUpgradeable_init();
        __Ownable_init();
        __Pausable_init();
        _transferOwnership(initialOwner);

        petCore             = PetCoreV1(petCore_);
        gameConfig          = GameConfig(gameConfig_);
        s_vrfCoordinator    = IVRFCoordinatorV2Plus(vrfCoordinator_);
        _rawVrfCoordinator  = vrfCoordinator_;
        vrfSubscriptionId   = subscriptionId_;
        vrfKeyHash          = keyHash_;
        vrfNativePayment    = nativePayment_;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── battle ───────────────────────────────────────────────────────────────

    function requestBattle(
        uint256 petId1,
        uint256 petId2
    ) external whenNotPaused onlyPetOwner(petId1) returns (uint256 requestId) {
        require(petId1 != petId2, "Can't fight self");
        require(petCore.isReady(petId1), "First pet not ready");
        require(petCore.isReady(petId2), "Second pet not ready");
        require(petCore.ownerOf(petId1) != petCore.ownerOf(petId2), "Can't fight own pet");

        (uint32 lvl1, , , ) = petCore.getPetStats(petId1);
        (uint32 lvl2, , , ) = petCore.getPetStats(petId2);
        uint32 gap = lvl1 > lvl2 ? lvl1 - lvl2 : lvl2 - lvl1;
        require(gap <= gameConfig.levelBandWidth(), "Level gap too large");
        require(
            petBattleRequestId[petId1] == 0 && petBattleRequestId[petId2] == 0,
            "Battle pending for pet"
        );

        requestId = _requestVrf();

        s_requestTypes[requestId]    = RequestType.Battle;
        petBattleRequestId[petId1]   = requestId;
        petBattleRequestId[petId2]   = requestId;
        s_battleRequests[requestId]  = PendingBattle({
            requester: msg.sender,
            petId1:    petId1,
            petId2:    petId2,
            vrfSeed:   0,
            fulfilled: false
        });

        emit BattleRandomnessRequested(msg.sender, requestId, petId1, petId2);
    }

    function settleBattle(uint256 requestId) external whenNotPaused {
        PendingBattle memory pending = s_battleRequests[requestId];
        require(pending.requester != address(0), "No pending battle");
        require(pending.fulfilled, "VRF not yet fulfilled");

        PetCoreV1.Pet memory p1 = petCore.getPet(pending.petId1);
        PetCoreV1.Pet memory p2 = petCore.getPet(pending.petId2);

        uint8 skill1 = uint8(p1.speciesId % 8);
        uint8 skill2 = uint8(p2.speciesId % 8);

        CombatSimV1.BattleResult memory sim = CombatSimV1(gameConfig.combatSim()).simulate(
            p1.dna, p1.rarity, p1.level, skill1,
            p2.dna, p2.rarity, p2.level, skill2,
            pending.vrfSeed,
            gameConfig.getSkillConfig()
        );

        uint256 winnerId    = sim.firstWins ? pending.petId1 : pending.petId2;
        uint256 loserId     = sim.firstWins ? pending.petId2 : pending.petId1;
        uint32  winnerLevel = sim.firstWins ? p1.level : p2.level;
        uint32  loserLevel  = sim.firstWins ? p2.level : p1.level;

        petCore.updateBattleStats(winnerId, true);
        petCore.updateBattleStats(loserId,  false);

        // XP formula (plan §3.4): xpMult = clamp(100 + 10*(oppLevel - myLevel), 0, 200)
        // Winner +100 XP × mult / 100.  Loser +25 XP × mult / 100.
        uint32 xpWin  = _calcXp(100, winnerLevel, loserLevel);
        uint32 xpLoss = _calcXp(25,  loserLevel,  winnerLevel);
        if (xpWin  > 0) petCore.addXp(winnerId, xpWin);
        if (xpLoss > 0) petCore.addXp(loserId,  xpLoss);

        petCore.triggerCooldown(pending.petId1);
        petCore.triggerCooldown(pending.petId2);

        petBattleRequestId[pending.petId1] = 0;
        petBattleRequestId[pending.petId2] = 0;
        delete s_battleRequests[requestId];

        emit BattleResolved(
            requestId,
            winnerId, loserId,
            pending.vrfSeed,
            sim.firstWins, sim.rounds, sim.winnerHpRemaining,
            xpWin, xpLoss
        );
    }

    function cancelBattle(uint256 requestId) external {
        PendingBattle memory pending = s_battleRequests[requestId];
        require(pending.requester != address(0), "No pending battle");
        require(
            msg.sender == pending.requester || msg.sender == owner(),
            "Not requester or owner"
        );
        require(!pending.fulfilled, "Already fulfilled - call settleBattle");

        petBattleRequestId[pending.petId1] = 0;
        petBattleRequestId[pending.petId2] = 0;
        delete s_requestTypes[requestId];
        delete s_battleRequests[requestId];
    }

    // ─── breeding ─────────────────────────────────────────────────────────────

    function requestCreateFromDNA(
        uint256 petId1,
        uint256 petId2,
        string calldata name_
    ) external payable whenNotPaused returns (uint256 requestId) {
        uint256 nameLen = bytes(name_).length;
        require(nameLen > 0 && nameLen <= gameConfig.maxNameLength(), "Invalid name length");
        require(msg.value >= gameConfig.breedFee(), "Insufficient breed fee");
        require(petCore.ownerOf(petId1) == msg.sender, "Not owner of first pet");
        require(petCore.ownerOf(petId2) == msg.sender, "Not owner of second pet");
        _validateBreedPair(petId1, petId2);
        require(
            petBreedRequestId[petId1] == 0 && petBreedRequestId[petId2] == 0,
            "Breed pending for parent"
        );

        requestId = _requestVrf();

        s_requestTypes[requestId]  = RequestType.Breed;
        petBreedRequestId[petId1]  = requestId;
        petBreedRequestId[petId2]  = requestId;
        s_breedRequests[requestId] = BreedRequest({
            owner:     msg.sender,
            petId1:    petId1,
            petId2:    petId2,
            name:      name_,
            vrfSeed:   0,
            fulfilled: false
        });

        emit BreedRandomnessRequested(msg.sender, requestId, petId1, petId2);
    }

    function settleBreed(uint256 requestId) external whenNotPaused {
        BreedRequest memory p = s_breedRequests[requestId];
        require(p.owner != address(0), "No pending breed");
        require(p.fulfilled, "VRF not yet fulfilled");

        PetCoreV1.Pet memory p1 = petCore.getPet(p.petId1);
        PetCoreV1.Pet memory p2 = petCore.getPet(p.petId2);

        uint8 gen = (p1.generation > p2.generation ? p1.generation : p2.generation) + 1;
        require(gen <= gameConfig.generationCap(), "Generation cap reached");

        uint256 childDna = _mixDna(p1.dna, p2.dna, p.vrfSeed);
        uint8   rarity   = _inheritRarity(p1.rarity, p2.rarity, childDna, p.vrfSeed);

        uint256 childId = petCore.createPet(p.name, childDna, rarity, gen, p.petId1, p.petId2);
        petCore.mintTo(p.owner, childId);
        // Override the default battle cooldown with the newborn lockout (plan §4.2).
        petCore.setCooldown(childId, gameConfig.newbornCooldown());

        uint256 cd1 = _breedCooldownFor(p1.breedCount);
        uint256 cd2 = _breedCooldownFor(p2.breedCount);
        petCore.triggerBreedCooldown(p.petId1, cd1);
        petCore.triggerBreedCooldown(p.petId2, cd2);

        petCore.incrementBreedCount(p.petId1);
        petCore.incrementBreedCount(p.petId2);

        petBreedRequestId[p.petId1] = 0;
        petBreedRequestId[p.petId2] = 0;
        delete s_breedRequests[requestId];

        emit BreedSettled(p.owner, childId, requestId);
    }

    function cancelBreed(uint256 requestId) external {
        BreedRequest memory p = s_breedRequests[requestId];
        require(p.owner != address(0), "No pending breed");
        require(
            msg.sender == p.owner || msg.sender == owner(),
            "Not owner or admin"
        );
        require(!p.fulfilled, "Already fulfilled - call settleBreed");

        petBreedRequestId[p.petId1] = 0;
        petBreedRequestId[p.petId2] = 0;
        delete s_requestTypes[requestId];
        delete s_breedRequests[requestId];
    }

    // ─── VRF callback ─────────────────────────────────────────────────────────

    // Inlined to avoid the dual-Initializable conflict when inheriting Chainlink's
    // VRFConsumerBaseV2Upgradeable alongside our OZ v4 upgradeable contracts.
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        require(msg.sender == _rawVrfCoordinator, "Only VRF coordinator");
        _fulfill(requestId, randomWords[0]);
    }

    function _fulfill(uint256 requestId, uint256 word) internal {
        RequestType type_ = s_requestTypes[requestId];
        delete s_requestTypes[requestId];
        if (type_ == RequestType.Battle) {
            s_battleRequests[requestId].vrfSeed   = word;
            s_battleRequests[requestId].fulfilled  = true;
        } else if (type_ == RequestType.Breed) {
            s_breedRequests[requestId].vrfSeed    = word;
            s_breedRequests[requestId].fulfilled   = true;
        }
        // Unknown requestId → ignore (coordinator may retry; no revert to avoid blocking)
    }

    // ─── training ─────────────────────────────────────────────────────────────

    // Pay a level-scaled fee for a flat XP grant; once per trainCooldown (plan §3.4).
    // trainFee(L) = baseFee × (100 + 2·L) / 100  → 1× at L1, ~3× at L100.
    function train(uint256 petId) external payable whenNotPaused onlyPetOwner(petId) {
        require(petCore.isTrainReady(petId), "Train cooldown active");

        PetCoreV1.Pet memory p = petCore.getPet(petId);
        uint256 scaledFee = gameConfig.trainFee() * (100 + 2 * uint256(p.level)) / 100;
        require(msg.value >= scaledFee, "Insufficient train fee");

        petCore.triggerTrainCooldown(petId);
        petCore.addXp(petId, gameConfig.trainXp());

        // Re-read to get updated xp and level after addXp auto-levels.
        PetCoreV1.Pet memory after_ = petCore.getPet(petId);
        emit Trained(petId, gameConfig.trainXp(), after_.xp, after_.level);
    }

    // ─── admin ────────────────────────────────────────────────────────────────

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    // ─── internal helpers ─────────────────────────────────────────────────────

    function _requestVrf() internal returns (uint256) {
        return s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:              vrfKeyHash,
                subId:                vrfSubscriptionId,
                requestConfirmations: VRF_REQUEST_CONFIRMATIONS,
                callbackGasLimit:     VRF_CALLBACK_GAS_LIMIT,
                numWords:             VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: vrfNativePayment})
                )
            })
        );
    }

    function _validateBreedPair(uint256 petId1, uint256 petId2) internal view {
        require(petId1 != petId2, "Can't breed with self");
        require(petCore.isBreedReady(petId1), "First parent not breed-ready");
        require(petCore.isBreedReady(petId2), "Second parent not breed-ready");

        // One-level incest guard (plan §4.1): neither pet may be a parent of the other.
        (, , uint256 p1Parent1, uint256 p1Parent2) = petCore.getBreedInfo(petId1);
        (, , uint256 p2Parent1, uint256 p2Parent2) = petCore.getBreedInfo(petId2);
        require(
            p1Parent1 != petId2 && p1Parent2 != petId2 &&
            p2Parent1 != petId1 && p2Parent2 != petId1,
            "Incest: parent-child breeding rejected"
        );
    }

    // Per-pair DNA mixing (plan §4.2): 45% parent-1, 45% parent-2, 10% mutation.
    function _mixDna(
        uint256 dna1,
        uint256 dna2,
        uint256 seed
    ) internal pure returns (uint256 child) {
        for (uint256 i = 0; i < 8; i++) {
            uint256 pairRand = uint256(keccak256(abi.encodePacked(seed, i)));
            uint256 pick = pairRand % 100;
            uint256 pair;
            if (pick < 10) {
                pair = pairRand % 100; // 10% mutation
            } else if (pick < 55) {
                pair = DnaLib.digitPair(dna1, i); // 45% parent 1
            } else {
                pair = DnaLib.digitPair(dna2, i); // 45% parent 2
            }
            child += pair * (10 ** (i * 2));
        }
    }

    // Rarity inheritance (plan §4.2): recompute from child DNA; +1 (5% chance) if both parents ≥4.
    function _inheritRarity(
        uint8 r1, uint8 r2,
        uint256 childDna,
        uint256 seed
    ) internal pure returns (uint8) {
        uint8 base = DnaLib.rarityFromDna(childDna);
        if (r1 >= 4 && r2 >= 4 && base < 5) {
            uint256 bumpRand = uint256(keccak256(abi.encodePacked(seed, "rarity"))) % 100;
            if (bumpRand < 5) return base + 1;
        }
        return base;
    }

    // Breed cooldown: breedCooldownBase * 2^breedCount, capped at 30 days (plan §4.1).
    function _breedCooldownFor(uint8 breedCount_) internal view returns (uint256) {
        uint256 base = gameConfig.breedCooldownBase();
        uint256 cd   = base << breedCount_;
        uint256 cap  = 30 days;
        return cd > cap ? cap : cd;
    }

    // XP formula (plan §3.4): baseXp × clamp(100 + 10*(oppLvl − myLvl), 0, 200) / 100.
    function _calcXp(uint32 baseXp, uint32 myLevel, uint32 oppLevel) internal pure returns (uint32) {
        int256 diff = int256(uint256(oppLevel)) - int256(uint256(myLevel));
        int256 mult = 100 + 10 * diff;
        if (mult <= 0) return 0;
        if (mult > 200) mult = 200;
        return uint32(uint256(baseXp) * uint256(mult) / 100);
    }
}
