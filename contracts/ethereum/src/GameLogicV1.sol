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

/**
 * @title GameLogicV1
 * @dev UUPS-upgradeable contract holding all game mechanics: battle, breed, VRF handling.
 *      Registered as the VRF consumer. Calls back into PetCoreV1 (authorized caller)
 *      to mutate pet state and mint tokens.
 *
 *      Battle flow (plan §3.5):
 *        1. requestBattle() — validates, issues VRF request, stores PendingBattle.
 *        2. VRF coordinator calls rawFulfillRandomWords() — stores seed, marks fulfilled.
 *        3. Anyone calls settleBattle(requestId) — runs CombatSimV1, applies result, emits BattleResolved.
 */
contract GameLogicV1 is UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {

    // ─── events ───────────────────────────────────────────────────────────────

    event BreedRandomnessRequested(
        address indexed owner,
        uint256 indexed requestId,
        uint256 petId1,
        uint256 petId2
    );
    event BreedFulfilled(address indexed owner, uint256 indexed childId, uint256 indexed requestId);

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
        uint32  xpAwarded
    );

    // ─── structs ──────────────────────────────────────────────────────────────

    struct PendingBreed {
        address owner;
        uint256 petId1;
        uint256 petId2;
        string  name;
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
    // Stored separately so rawFulfillRandomWords can check msg.sender without
    // inheriting VRFConsumerBaseV2Upgradeable (dual-Initializable conflict).
    address                  private _rawVrfCoordinator;

    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    bool    public vrfNativePayment;

    uint32  private constant VRF_CALLBACK_GAS_LIMIT    = 500_000;
    uint16  private constant VRF_REQUEST_CONFIRMATIONS = 3;
    uint32  private constant VRF_NUM_WORDS             = 1;

    mapping(uint256 => PendingBreed)   private s_breedRequests;
    mapping(uint256 => uint256)        public  petBreedRequestId;

    // Phase 2: VRF battle — store-then-settle (plan §3.5)
    mapping(uint256 => RequestType)    private s_requestTypes;
    mapping(uint256 => PendingBattle)  private s_battleRequests;
    mapping(uint256 => uint256)        public  petBattleRequestId;

    // Reserve 37 slots: 11 declared above (petCore..petBattleRequestId) + 37 gap = 48 total.
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

    // ─── battle — Phase 2 VRF request→store→settle (plan §3.5) ───────────────

    function requestBattle(
        uint256 petId1,
        uint256 petId2
    ) external whenNotPaused onlyPetOwner(petId1) returns (uint256 requestId) {
        require(petId1 != petId2, "Can't fight self");
        require(petCore.isReady(petId1), "First pet not ready");
        require(petCore.isReady(petId2), "Second pet not ready");

        // Same-owner ban: prevents farming XP from own pets (plan §3.4)
        require(
            petCore.ownerOf(petId1) != petCore.ownerOf(petId2),
            "Can't fight own pet"
        );

        // Level band: max 10-level gap to prevent seal-clubbing (plan §3.4)
        (uint32 lvl1, , , ) = petCore.getPetStats(petId1);
        (uint32 lvl2, , , ) = petCore.getPetStats(petId2);
        uint32 gap = lvl1 > lvl2 ? lvl1 - lvl2 : lvl2 - lvl1;
        require(gap <= 10, "Level gap too large");

        // Block a second battle request while one is pending
        require(
            petBattleRequestId[petId1] == 0 && petBattleRequestId[petId2] == 0,
            "Battle pending for pet"
        );

        requestId = s_vrfCoordinator.requestRandomWords(
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

        CombatSimV1.BattleResult memory sim = CombatSimV1(gameConfig.combatSim()).simulate(
            p1.dna, p1.rarity,
            p2.dna, p2.rarity,
            pending.vrfSeed
        );

        uint256 winnerId    = sim.firstWins ? pending.petId1 : pending.petId2;
        uint256 loserId     = sim.firstWins ? pending.petId2 : pending.petId1;
        uint32  winnerLevel = sim.firstWins ? p1.level : p2.level;
        uint32  loserLevel  = sim.firstWins ? p2.level : p1.level;

        petCore.updateBattleStats(winnerId, true);
        petCore.updateBattleStats(loserId,  false);

        // XP formula (plan §3.4): 10 × max(1, (loserLevel − winnerLevel + 10) / 10)
        // Zero if winner is ≥ 11 levels above loser (anti seal-clubbing).
        uint32 xp;
        if (winnerLevel <= loserLevel + 10) {
            uint32 scaling = (loserLevel + 10 - winnerLevel) / 10;
            xp = 10 * (scaling > 0 ? scaling : 1);
            petCore.addXp(winnerId, xp);
        }

        petCore.triggerCooldown(pending.petId1);
        petCore.triggerCooldown(pending.petId2);

        petBattleRequestId[pending.petId1] = 0;
        petBattleRequestId[pending.petId2] = 0;
        delete s_battleRequests[requestId];

        emit BattleResolved(
            requestId,
            winnerId,
            loserId,
            pending.vrfSeed,
            sim.firstWins,
            sim.rounds,
            sim.winnerHpRemaining,
            xp
        );
    }

    // Cancel a stuck battle request (no VRF word arrived, or requester wants to abort).
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

    // ─── breeding (VRF) ───────────────────────────────────────────────────────

    function requestCreateFromDNA(
        uint256 petId1,
        uint256 petId2,
        string calldata name_
    ) external whenNotPaused returns (uint256 requestId) {
        uint256 nameLen = bytes(name_).length;
        require(nameLen > 0 && nameLen <= gameConfig.maxNameLength(), "Invalid name length");
        require(petCore.ownerOf(petId1) == msg.sender, "Not owner of first pet");
        _validateBreedPair(petId1, petId2);
        require(
            petBreedRequestId[petId1] == 0 && petBreedRequestId[petId2] == 0,
            "Breed pending for parent"
        );

        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash:               vrfKeyHash,
                subId:                 vrfSubscriptionId,
                requestConfirmations:  VRF_REQUEST_CONFIRMATIONS,
                callbackGasLimit:      VRF_CALLBACK_GAS_LIMIT,
                numWords:              VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: vrfNativePayment})
                )
            })
        );

        s_requestTypes[requestId]  = RequestType.Breed;
        petBreedRequestId[petId1]  = requestId;
        petBreedRequestId[petId2]  = requestId;
        s_breedRequests[requestId] = PendingBreed({
            owner:  msg.sender,
            petId1: petId1,
            petId2: petId2,
            name:   name_
        });

        emit BreedRandomnessRequested(msg.sender, requestId, petId1, petId2);
    }

    // Entry point called by the VRF coordinator (mirrors VRFConsumerBaseV2Upgradeable).
    // Inlined to avoid the dual-Initializable conflict when inheriting Chainlink's
    // upgradeable base alongside our OZ v4 upgradeable contracts.
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        require(msg.sender == _rawVrfCoordinator, "Only VRF coordinator");
        _fulfill(requestId, randomWords);
    }

    function _fulfill(uint256 requestId, uint256[] memory randomWords) internal {
        RequestType type_ = s_requestTypes[requestId];
        if (type_ == RequestType.Breed) {
            delete s_requestTypes[requestId];
            _fulfillBreed(requestId, randomWords[0]);
        } else if (type_ == RequestType.Battle) {
            delete s_requestTypes[requestId];
            // Store-then-settle: persist the VRF word; settleBattle() runs the sim.
            s_battleRequests[requestId].vrfSeed   = randomWords[0];
            s_battleRequests[requestId].fulfilled  = true;
        }
        // Unknown requestId → ignore (coordinator may retry; no revert to avoid blocking)
    }

    function _fulfillBreed(uint256 requestId, uint256 randomWord) internal {
        PendingBreed memory p = s_breedRequests[requestId];
        require(p.owner != address(0), "No pending breed");

        PetCoreV1.Pet memory p1 = petCore.getPet(p.petId1);
        PetCoreV1.Pet memory p2 = petCore.getPet(p.petId2);

        uint256 newDna = uint256(
            keccak256(abi.encodePacked(randomWord, p1.dna, p2.dna))
        ) % petCore.DNA_MODULUS();
        uint8 rarity = _calculateRarity(newDna);

        uint256 childId = petCore.createPet(p.name, newDna, rarity);
        petCore.mintTo(p.owner, childId);

        petCore.triggerCooldown(p.petId1);
        petCore.triggerCooldown(p.petId2);

        petBreedRequestId[p.petId1] = 0;
        petBreedRequestId[p.petId2] = 0;
        delete s_breedRequests[requestId];

        emit BreedFulfilled(p.owner, childId, requestId);
    }

    // ─── admin ────────────────────────────────────────────────────────────────

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── internal helpers ─────────────────────────────────────────────────────

    function _validateBreedPair(uint256 petId1, uint256 petId2) internal view {
        require(petId1 != petId2, "Can't breed with self");
        require(petCore.isReady(petId1), "First parent not ready");
        require(petCore.isReady(petId2), "Second parent not ready");
    }

    function _calculateRarity(uint256 dna) internal pure returns (uint8) {
        uint256 score = dna % 100;
        if (score < 50) return 1;
        if (score < 75) return 2;
        if (score < 90) return 3;
        if (score < 98) return 4;
        return 5;
    }
}
