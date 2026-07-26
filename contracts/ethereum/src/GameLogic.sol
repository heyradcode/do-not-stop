// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IEntropyV2} from "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";

import "./PetCore.sol";
import "./GameConfig.sol";
import "./DnaLib.sol";

/**
 * @title GameLogic
 * @dev UUPS-upgradeable contract holding the on-chain game mechanics: breeding, starter
 *      minting, training, and randomness handling.
 *
 *      Breed and mint use the store-then-settle pattern (plan §3.5):
 *        requestCreateFromDNA / requestMintStarter → Pyth Entropy request, store pending record
 *        entropyCallback                           → store randomness only (provider's default callback gas)
 *        settleBreed / settleMint                  → mix DNA, apply results
 *      This makes a failed settle retryable.
 *
 *      **Battles are no longer settled here** (§L Phase 6). They run through the
 *      backend-authoritative path — signed intent, committed drand round, signed receipt,
 *      Merkle batch anchored by `BattleBatchRegistry` — so this contract no longer runs the
 *      combat simulator or mutates pet battle state. `CombatSim.sol` remains in the
 *      repository as the Solidity leg of the cross-language golden-vector check, but is not
 *      deployed and has no on-chain caller.
 */
contract GameLogic is UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable, IEntropyConsumer {

    string public constant VERSION = "1.1.0";

    // ─── events ───────────────────────────────────────────────────────────────

    event BreedRandomnessRequested(
        address indexed owner,
        uint256 indexed requestId,
        uint256 petId1,
        uint256 petId2
    );
    event BreedSettled(
        address indexed owner,
        uint256 indexed childId,
        uint256 indexed requestId,
        address studFeePaidTo // zero for same-owner breeds (plan §4.4)
    );


    event Trained(uint256 indexed petId, uint32 xpGained, uint32 newXp, uint32 newLevel);

    event MintRequested(address indexed owner, uint256 indexed requestId);
    event MintSettled(address indexed owner, uint256 indexed petId, uint256 indexed requestId);

    event GameConfigUpdated(address config);

    // ─── structs ──────────────────────────────────────────────────────────────

    struct MintRequest {
        address owner;
        string  name;
        uint256 mintFee;    // escrowed mint fee; refunded on cancel, kept as revenue on settle
        uint256 randomness;
        bool    fulfilled;
    }

    struct BreedRequest {
        address owner;
        uint256 petId1;
        uint256 petId2;
        string  name;
        uint256 randomness;
        bool    fulfilled;
        uint256 studFee;    // escrowed at request time; 0 for same-owner breeds (plan §4.4)
        address otherOwner; // recipient of studFee at settle; address(0) for same-owner breeds
    }

    /// @dev `Battle` is retired (§L Phase 6) but kept in place: removing it would renumber
    ///      `Mint`, and this enum's values are persisted in `_requestTypes`.
    enum RequestType { None, Breed, RetiredBattle, Mint }

    // ─── storage (layout append-only) ────────────────────────────────────────

    PetCore                public petCore;
    GameConfig               public gameConfig;
    IEntropyV2               public entropy;

    mapping(uint256 => BreedRequest)   private _breedRequests;
    mapping(uint256 => uint256)        public  petBreedRequestId;

    mapping(uint256 => RequestType)    private _requestTypes;
    /// @dev Retired with the on-chain battle path (§L Phase 6). The slots stay declared and
    ///      unused rather than deleted: this contract sits behind a UUPS proxy, and removing a
    ///      storage variable shifts every slot after it, which would silently reinterpret live
    ///      breeding and mint state on the next upgrade. Never reuse these.
    mapping(uint256 => uint256)        private __retired_battleRequests;
    mapping(uint256 => uint256)        private __retired_petBattleRequestId;

    // Stud fees owed to the non-initiating owner of a cross-owner breed (plan §4.4),
    // released as a pull payment via withdrawStudFees().
    mapping(address => uint256)        public  pendingStudFees;

    // Pending starter mints (plan §4.3): DNA is fixed by the Entropy reveal, not at request.
    mapping(uint256 => MintRequest)    private _mintRequests;

    // Reserve 40 slots: 10 declared above (through _mintRequests) + 40 gap = 50 total.
    uint256[40] private __gap;

    // ─── modifiers ────────────────────────────────────────────────────────────

    modifier onlyPetOwner(uint256 petId) {
        require(petCore.ownerOf(petId) == msg.sender, "Not the owner of this pet");
        _;
    }

    // ─── constructor / initializer ────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // implementation must never be initialized directly
    }

    function initialize(
        address entropy_,
        address petCore_,
        address gameConfig_,
        address initialOwner
    ) public initializer {
        __UUPSUpgradeable_init();
        __Ownable_init();
        __Pausable_init();
        _transferOwnership(initialOwner);

        petCore    = PetCore(petCore_);
        gameConfig = GameConfig(gameConfig_);
        entropy    = IEntropyV2(entropy_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Repoint at a newly deployed GameConfig (GameConfig itself isn't a proxy —
    ///         adding a tunable means deploying a fresh instance and calling this).
    /// @dev The new instance starts from GameConfig's constructor defaults; the caller is
    ///      responsible for replaying any prior on-chain tuning (setBreedFee, etc.) onto it
    ///      before or after pointing this proxy at it.
    function setGameConfig(address gameConfig_) external onlyOwner {
        require(gameConfig_ != address(0), "Zero address");
        gameConfig = GameConfig(gameConfig_);
        emit GameConfigUpdated(gameConfig_);
    }

    // ─── breeding ─────────────────────────────────────────────────────────────

    /// @notice Request to breed two pets into a named child, paying breed (+ stud) + Entropy fees.
    /// @dev Same-owner pays breedFee; cross-owner requires a valid marriage and escrows studFee.
    /// @param petId1 First parent.
    /// @param petId2 Second parent.
    /// @param name_ Child name (1..maxNameLength bytes).
    /// @return requestId The Entropy sequence number identifying this pending breed.
    function requestCreateFromDNA(
        uint256 petId1,
        uint256 petId2,
        string calldata name_
    ) external payable whenNotPaused returns (uint256 requestId) {
        uint256 nameLen = bytes(name_).length;
        require(nameLen > 0 && nameLen <= gameConfig.maxNameLength(), "Invalid name length");

        address owner1 = petCore.ownerOf(petId1);
        address owner2 = petCore.ownerOf(petId2);

        uint256 entropyFee = entropy.getFeeV2();
        uint256 studFeeAmount;
        address otherOwner;

        if (owner1 == owner2) {
            require(owner1 == msg.sender, "Not owner of both pets");
            require(msg.value >= gameConfig.breedFee() + entropyFee, "Insufficient breed/entropy fee");
        } else {
            // Cross-owner breeding requires an active marriage (plan §4.4).
            require(owner1 == msg.sender || owner2 == msg.sender, "Caller must own one of the pets");
            require(petCore.isMarriageValid(petId1, petId2), "Pets are not married");
            studFeeAmount = gameConfig.studFee();
            otherOwner    = (owner1 == msg.sender) ? owner2 : owner1;
            require(msg.value >= gameConfig.breedFee() + studFeeAmount + entropyFee, "Insufficient breed/stud/entropy fee");
        }

        _validateBreedPair(petId1, petId2);
        require(
            petBreedRequestId[petId1] == 0 && petBreedRequestId[petId2] == 0,
            "Breed pending for parent"
        );

        requestId = _requestRandomness(entropyFee);

        _requestTypes[requestId]  = RequestType.Breed;
        petBreedRequestId[petId1]  = requestId;
        petBreedRequestId[petId2]  = requestId;
        _breedRequests[requestId] = BreedRequest({
            owner:      msg.sender,
            petId1:     petId1,
            petId2:     petId2,
            name:       name_,
            randomness: 0,
            fulfilled:  false,
            studFee:    studFeeAmount,
            otherOwner: otherOwner
        });

        emit BreedRandomnessRequested(msg.sender, requestId, petId1, petId2);
    }

    /// @notice Mint the child for a fulfilled breed request and apply cooldowns/stud fee.
    /// @dev Permissionless once entropy is fulfilled; reverts if it would exceed the generation cap.
    /// @param requestId The pending breed's Entropy sequence number.
    function settleBreed(uint256 requestId) external whenNotPaused {
        BreedRequest memory p = _breedRequests[requestId];
        require(p.owner != address(0), "No pending breed");
        require(p.fulfilled, "Entropy not yet fulfilled");

        PetCore.Pet memory p1 = petCore.getPet(p.petId1);
        PetCore.Pet memory p2 = petCore.getPet(p.petId2);

        uint8 gen = (p1.generation > p2.generation ? p1.generation : p2.generation) + 1;
        require(gen <= gameConfig.generationCap(), "Generation cap reached");

        uint256 childDna = _mixDna(p1.dna, p2.dna, p.randomness);
        uint8   rarity   = _inheritRarity(p1.rarity, p2.rarity, childDna, p.randomness);

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

        // Stud fee was escrowed at request time; release it as a pull payment now (plan §4.4).
        if (p.studFee > 0) {
            pendingStudFees[p.otherOwner] += p.studFee;
        }

        petBreedRequestId[p.petId1] = 0;
        petBreedRequestId[p.petId2] = 0;
        delete _breedRequests[requestId];

        emit BreedSettled(p.owner, childId, requestId, p.otherOwner);
    }

    /// @notice Cancel an unfulfilled breed request, freeing the parents and refunding any escrowed stud fee.
    /// @dev Callable by the original owner or the contract owner; rejected once fulfilled.
    /// @param requestId The pending breed's Entropy sequence number.
    function cancelBreed(uint256 requestId) external {
        BreedRequest memory p = _breedRequests[requestId];
        require(p.owner != address(0), "No pending breed");
        require(
            msg.sender == p.owner || msg.sender == owner(),
            "Not owner or admin"
        );
        require(!p.fulfilled, "Already fulfilled - call settleBreed");

        petBreedRequestId[p.petId1] = 0;
        petBreedRequestId[p.petId2] = 0;
        delete _requestTypes[requestId];
        delete _breedRequests[requestId];

        // No breed, no stud fee — refund the escrowed amount (plan §4.4).
        if (p.studFee > 0) {
            (bool ok, ) = payable(p.owner).call{value: p.studFee}("");
            require(ok, "Stud fee refund failed");
        }
    }

    /// @notice Withdraw stud fees credited to the caller by cross-owner breed settlements (plan §4.4).
    function withdrawStudFees() external {
        uint256 amount = pendingStudFees[msg.sender];
        require(amount > 0, "No stud fees to withdraw");
        pendingStudFees[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Withdraw failed");
    }

    // ─── entropy callback ─────────────────────────────────────────────────────

    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    function entropyCallback(
        uint64 sequenceNumber,
        address /* provider */,
        bytes32 randomNumber
    ) internal override {
        _fulfill(uint256(sequenceNumber), uint256(randomNumber));
    }

    function _fulfill(uint256 requestId, uint256 word) internal {
        RequestType type_ = _requestTypes[requestId];
        delete _requestTypes[requestId];
        if (type_ == RequestType.Breed) {
            _breedRequests[requestId].randomness  = word;
            _breedRequests[requestId].fulfilled   = true;
        } else if (type_ == RequestType.Mint) {
            _mintRequests[requestId].randomness   = word;
            _mintRequests[requestId].fulfilled    = true;
        }
        // Unknown requestId → ignore (defensive; should not happen for entropy-issued sequence numbers)
    }

    // ─── starter minting (plan §4.3) ──────────────────────────────────────────

    /// @notice Request a starter (gen-0) pet; DNA is derived from a future Entropy reveal so the
    ///         rarity outcome can't be ground out by retrying or reverting on a bad result.
    /// @dev Escalating mint fee = baseMintFee × (1 + walletMintCount), plus the Entropy fee.
    ///      The pet is minted by settleMint once randomness is fulfilled; the count is bumped then.
    /// @param name_ The pet's name (1..maxNameLength bytes).
    /// @return requestId The Entropy sequence number identifying this pending mint.
    function requestMintStarter(
        string calldata name_
    ) external payable whenNotPaused returns (uint256 requestId) {
        uint256 nameLen = bytes(name_).length;
        require(nameLen > 0 && nameLen <= gameConfig.maxNameLength(), "Invalid name length");

        uint256 mintCount  = petCore.walletMintCount(msg.sender);
        uint256 mintFee    = gameConfig.baseMintFee() * (1 + mintCount);
        uint256 entropyFee = entropy.getFeeV2();
        require(msg.value >= mintFee + entropyFee, "Insufficient mint/entropy fee");

        requestId = _requestRandomness(entropyFee);

        _requestTypes[requestId] = RequestType.Mint;
        _mintRequests[requestId] = MintRequest({
            owner:      msg.sender,
            name:       name_,
            mintFee:    mintFee,
            randomness: 0,
            fulfilled:  false
        });

        emit MintRequested(msg.sender, requestId);
    }

    /// @notice Mint the starter pet for a fulfilled mint request using the revealed randomness.
    /// @dev Permissionless once entropy is fulfilled (retryable); bumps the owner's lifetime mint count.
    /// @param requestId The pending mint's Entropy sequence number.
    function settleMint(uint256 requestId) external whenNotPaused {
        MintRequest memory m = _mintRequests[requestId];
        require(m.owner != address(0), "No pending mint");
        require(m.fulfilled, "Entropy not yet fulfilled");

        delete _mintRequests[requestId];

        // DNA fixed by the reveal: domain-separated hash → 16-digit DNA (DnaLib.DNA_MODULUS).
        uint256 dna    = uint256(keccak256(abi.encodePacked(m.randomness, "starter"))) % DnaLib.DNA_MODULUS;
        uint8   rarity = DnaLib.rarityFromDna(dna);

        petCore.incrementWalletMintCount(m.owner);
        uint256 petId = petCore.createPet(m.name, dna, rarity, 0, 0, 0);
        petCore.mintTo(m.owner, petId);

        emit MintSettled(m.owner, petId, requestId);
    }

    /// @notice Cancel an unfulfilled mint request, refunding the escrowed mint fee.
    /// @dev Callable by the original requester or the contract owner; rejected once fulfilled —
    ///      commit-reveal means the DNA can't be previewed and re-rolled. The Entropy fee is
    ///      non-refundable (already paid to the provider).
    /// @param requestId The pending mint's Entropy sequence number.
    function cancelMint(uint256 requestId) external {
        MintRequest memory m = _mintRequests[requestId];
        require(m.owner != address(0), "No pending mint");
        require(
            msg.sender == m.owner || msg.sender == owner(),
            "Not requester or owner"
        );
        require(!m.fulfilled, "Already fulfilled - call settleMint");

        delete _requestTypes[requestId];
        delete _mintRequests[requestId];

        if (m.mintFee > 0) {
            (bool ok, ) = payable(m.owner).call{value: m.mintFee}("");
            require(ok, "Mint fee refund failed");
        }
    }

    // ─── training ─────────────────────────────────────────────────────────────

    /// @notice Pay a level-scaled fee for a flat XP grant; once per trainCooldown (plan §3.4).
    /// @dev trainFee(L) = baseFee × (100 + 2·L) / 100 → 1× at L1, ~3× at L100.
    /// @param petId The caller's pet to train.
    function train(uint256 petId) external payable whenNotPaused onlyPetOwner(petId) {
        require(petCore.isTrainReady(petId), "Train cooldown active");

        PetCore.Pet memory p = petCore.getPet(petId);
        uint256 scaledFee = gameConfig.trainFee() * (100 + 2 * uint256(p.level)) / 100;
        require(msg.value >= scaledFee, "Insufficient train fee");

        uint32 trainXp = gameConfig.trainXp();
        petCore.triggerTrainCooldown(petId);
        petCore.addXp(petId, trainXp);

        // Re-read to get updated xp and level after addXp auto-levels.
        PetCore.Pet memory after_ = petCore.getPet(petId);
        emit Trained(petId, trainXp, after_.xp, after_.level);
    }

    // ─── admin ────────────────────────────────────────────────────────────────

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    // ─── internal helpers ─────────────────────────────────────────────────────

    function _requestRandomness(uint256 fee) internal returns (uint256) {
        return uint256(entropy.requestV2{value: fee}());
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
