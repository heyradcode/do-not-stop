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
 */
contract GameLogicV1 is UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {
    event BreedRandomnessRequested(
        address indexed owner,
        uint256 indexed requestId,
        uint256 petId1,
        uint256 petId2
    );
    event BreedFulfilled(address indexed owner, uint256 indexed childId, uint256 indexed requestId);
    event FightResult(uint256 petId1, uint256 petId2, bool firstWins);

    struct PendingBreed {
        address owner;
        uint256 petId1;
        uint256 petId2;
        string  name;
    }

    PetCoreV1                public petCore;
    GameConfig               public gameConfig;
    IVRFCoordinatorV2Plus    public s_vrfCoordinator;
    // Stored separately from s_vrfCoordinator to mirror VRFConsumerBaseV2Upgradeable's
    // private slot — rawFulfillRandomWords uses this for the caller check.
    address                  private _rawVrfCoordinator;

    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    bool    public vrfNativePayment;

    uint32  private constant VRF_CALLBACK_GAS_LIMIT    = 500_000;
    uint16  private constant VRF_REQUEST_CONFIRMATIONS = 3;
    uint32  private constant VRF_NUM_WORDS             = 1;

    mapping(uint256 => PendingBreed) private s_breedRequests;
    mapping(uint256 => uint256)      public  petBreedRequestId;

    // Reserve 40 slots: 8 declared (petCore..petBreedRequestId) + 40 gap = 48 for GameLogicV1's scope.
    uint256[40] private __gap;

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

        petCore          = PetCoreV1(petCore_);
        gameConfig       = GameConfig(gameConfig_);
        s_vrfCoordinator    = IVRFCoordinatorV2Plus(vrfCoordinator_);
        _rawVrfCoordinator  = vrfCoordinator_;
        vrfSubscriptionId = subscriptionId_;
        vrfKeyHash        = keyHash_;
        vrfNativePayment  = nativePayment_;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── battle ───────────────────────────────────────────────────────────────

    function attack(
        uint256 petId,
        uint256 targetId
    ) external whenNotPaused onlyPetOwner(petId) {
        require(petId != targetId, "Can't attack self");
        require(petCore.isReady(petId),    "Pet not ready");
        require(petCore.isReady(targetId), "Enemy not ready");

        // Phase-1: deterministic seed (VRF for battle comes in Phase 2, plan §3.5).
        uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, petId, targetId)));
        bool won = CombatSimV1(gameConfig.combatSim()).simulate(petId, targetId, seed);

        if (won) {
            petCore.updateBattleStats(petId, true);
            petCore.updateBattleStats(targetId, false);
            petCore.levelUpInternal(petId);
        } else {
            petCore.updateBattleStats(petId, false);
            petCore.updateBattleStats(targetId, true);
            petCore.triggerCooldown(petId);
        }

        emit FightResult(petId, targetId, won);
    }

    function fight(
        uint256 petId1,
        uint256 petId2
    ) external whenNotPaused onlyPetOwner(petId1) {
        require(petId1 != petId2, "Can't fight self");
        require(petCore.isReady(petId1), "First pet not ready");
        require(petCore.isReady(petId2), "Second pet not ready");

        uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, petId1, petId2)));
        bool firstWins = CombatSimV1(gameConfig.combatSim()).simulate(petId1, petId2, seed);

        if (firstWins) {
            petCore.updateBattleStats(petId1, true);
            petCore.updateBattleStats(petId2, false);
            petCore.levelUpInternal(petId1);
        } else {
            petCore.updateBattleStats(petId2, true);
            petCore.updateBattleStats(petId1, false);
            petCore.levelUpInternal(petId2);
        }

        petCore.triggerCooldown(petId1);
        petCore.triggerCooldown(petId2);

        emit FightResult(petId1, petId2, firstWins);
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

        petBreedRequestId[petId1] = requestId;
        petBreedRequestId[petId2] = requestId;
        s_breedRequests[requestId] = PendingBreed({
            owner:  msg.sender,
            petId1: petId1,
            petId2: petId2,
            name:   name_
        });

        emit BreedRandomnessRequested(msg.sender, requestId, petId1, petId2);
    }

    // Entry point called by the VRF coordinator (mirrors VRFConsumerBaseV2Upgradeable).
    // Inlined here to avoid the dual-Initializable conflict from inheriting Chainlink's
    // upgradeable base alongside our OZ v4 upgradeable contracts.
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        require(msg.sender == _rawVrfCoordinator, "Only VRF coordinator");
        fulfillRandomWords(requestId, randomWords);
    }

    function fulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) internal {
        PendingBreed memory p = s_breedRequests[requestId];
        require(p.owner != address(0), "No pending breed");

        PetCoreV1.Pet memory p1 = petCore.getPet(p.petId1);
        PetCoreV1.Pet memory p2 = petCore.getPet(p.petId2);

        uint256 newDna = uint256(
            keccak256(abi.encodePacked(randomWords[0], p1.dna, p2.dna))
        ) % petCore.DNA_MODULUS();
        uint8 rarity = _calculateRarity(newDna);

        uint256 childId = petCore.createPet(p.name, newDna, rarity);
        // Use mintTo (backed by _mint) so a bad receiver can't revert this callback.
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
