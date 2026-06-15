// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./GameConfig.sol";
import "./DnaLib.sol";

/**
 * @title PetCoreV1
 * @dev UUPS-upgradeable ERC-721 that owns all pet data (DNA, stats, lineage, cooldowns).
 *      Exposes mutator methods callable only by the authorized GameLogicV1 proxy (or owner).
 *      Storage layout must be append-only from this point forward.
 */
contract PetCoreV1 is ERC721PausableUpgradeable, UUPSUpgradeable, OwnableUpgradeable {
    event NewPet(uint256 indexed petId, string name, uint256 dna, uint8 rarity);
    event PetLevelUp(uint256 indexed petId, uint32 newLevel);
    event PetNameChanged(uint256 indexed petId, string newName);
    event PetTransferred(uint256 indexed tokenId, address from, address to);
    event MarriageProposed(uint256 indexed petIdA, uint256 indexed petIdB);
    event MarriageAccepted(uint256 indexed petIdA, uint256 indexed petIdB);
    event MarriageDissolved(uint256 indexed petIdA, uint256 indexed petIdB, string reason);
    event CallerAuthorized(address indexed caller);
    event CallerRevoked(address indexed caller);

    struct Pet {
        string name;
        uint256 dna;
        uint32 level;
        uint32 readyTime;
        uint16 winCount;
        uint16 lossCount;
        uint8  rarity;
        uint32 xp;           // XP toward next level; auto-levels at 100 * currentLevel
        uint8  generation;   // 0 = starter; N = N breeding events from starters
        uint8  breedCount;   // how many times this pet has been used for breeding
        uint32 breedReadyAt; // breed-specific cooldown (separate from battle, plan §4.1)
        uint32 trainReadyAt; // train-specific cooldown (plan §3.4)
        uint16 speciesId;    // resolved at mint from DNA + rarity tier (plan §3.7)
        uint256 parent1Id;   // 0 for gen-0 pets
        uint256 parent2Id;   // 0 for gen-0 pets
        uint256 lastOpponentId;    // 0 = no battles yet (plan §3.4 same-opponent decay)
        uint8   sameOpponentStreak; // consecutive battles vs lastOpponentId; halves XP each time
    }

    // Marriage record (plan §4.4): written for both pets at accept time (mutual).
    // ownerSnapshot is that pet's owner when consent was given; a transfer makes
    // the marriage lazily stale (checked at breed time / clearStaleMarriage).
    struct MarriageRecord {
        uint256 spouseId;
        address ownerSnapshot;
    }

    // Pending proposal from petIdA → petIdB, stored keyed by petIdA.
    struct MarriageProposalData {
        uint256 petIdB;
        address proposer;
        uint256 expiry;
    }

    uint256 public constant DNA_DIGITS  = 16;
    uint256 public constant DNA_MODULUS = 10 ** DNA_DIGITS;
    uint256 public constant NAME_CHANGE_LEVEL = 2;

    uint256 private _petCount;
    mapping(uint256 => Pet)   private _pets;
    mapping(address => bool)  public  authorizedCallers;
    GameConfig                public  gameConfig;
    mapping(address => uint256) public walletMintCount; // total lifetime mints per wallet

    mapping(uint256 => MarriageRecord)        public marriageOf;
    mapping(uint256 => MarriageProposalData)  public marriageProposal;     // keyed by petIdA
    mapping(uint256 => uint256)               public marriageCooldownUntil; // petId => timestamp

    // Reserve 42 slots: 8 declared above (through marriageCooldownUntil) + 42 gap = 50 for PetCoreV1's scope.
    uint256[42] private __gap;

    // ─── modifiers ────────────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        require(msg.sender == owner() || authorizedCallers[msg.sender], "Not authorized");
        _;
    }

    modifier entryExists(uint256 petId) {
        require(petId > 0 && petId <= _petCount, "Pet doesn't exist");
        _;
    }

    modifier onlyPetOwner(uint256 tokenId) {
        require(ownerOf(tokenId) == msg.sender, "Not the owner of this pet");
        _;
    }

    modifier aboveLevel(uint256 level_, uint256 tokenId) {
        require(_pets[tokenId].level >= level_, "Pet level too low");
        _;
    }

    // ─── constructor / initializer ────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // implementation must never be initialized directly
    }

    function initialize(address gameConfig_, address initialOwner) public initializer {
        __ERC721_init("CryptoPets", "PETS");
        __ERC721Pausable_init(); // also runs __Pausable_init_unchained
        __UUPSUpgradeable_init();
        __Ownable_init();
        _transferOwnership(initialOwner);
        gameConfig = GameConfig(gameConfig_);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── caller authorization ─────────────────────────────────────────────────

    function authorizeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
        emit CallerAuthorized(caller);
    }

    function revokeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
        emit CallerRevoked(caller);
    }

    // ─── authorized mutators (called by GameLogicV1) ─────────────────────────

    function createPet(
        string memory name_,
        uint256 dna,
        uint8 rarity,
        uint8 generation,
        uint256 parent1Id,
        uint256 parent2Id
    ) external onlyAuthorized returns (uint256) {
        return _createPet(name_, dna, rarity, generation, parent1Id, parent2Id);
    }

    function mintTo(address to, uint256 tokenId) external onlyAuthorized {
        _mint(to, tokenId);
    }

    function triggerCooldown(uint256 petId) external onlyAuthorized entryExists(petId) {
        _pets[petId].readyTime = _deadline(gameConfig.battleCooldown());
    }

    // Set the breed-specific cooldown (does NOT touch the battle readyTime).
    function triggerBreedCooldown(
        uint256 petId,
        uint256 cooldownSeconds
    ) external onlyAuthorized entryExists(petId) {
        _pets[petId].breedReadyAt = _deadline(cooldownSeconds);
    }

    // Override battle readyTime directly (used for newborn cooldown on bred pets).
    function setCooldown(uint256 petId, uint256 cooldownSeconds) external onlyAuthorized entryExists(petId) {
        _pets[petId].readyTime = _deadline(cooldownSeconds);
    }

    // Set the train-specific cooldown.
    function triggerTrainCooldown(uint256 petId) external onlyAuthorized entryExists(petId) {
        _pets[petId].trainReadyAt = _deadline(gameConfig.trainCooldown());
    }

    function updateBattleStats(uint256 petId, bool won) external onlyAuthorized entryExists(petId) {
        if (won) { _pets[petId].winCount++; } else { _pets[petId].lossCount++; }
    }

    function addXp(uint256 petId, uint32 amount) external onlyAuthorized entryExists(petId) {
        Pet storage p = _pets[petId];
        uint32 cap = gameConfig.maxLevel();
        if (p.level >= cap) return; // already at cap — no XP accrual
        p.xp += amount;
        uint32 threshold = 100 * p.level;
        if (p.xp >= threshold) {
            p.xp -= threshold;
            p.level++;
            if (p.level > cap) p.level = cap; // clamp (defensive)
            emit PetLevelUp(petId, p.level);
        }
    }

    function incrementBreedCount(uint256 petId) external onlyAuthorized entryExists(petId) {
        _pets[petId].breedCount++;
    }

    /// @dev Bump a wallet's lifetime mint count; called by GameLogicV1 when a requested
    ///      starter mint settles, so the escalating mint fee tracks successful mints.
    function incrementWalletMintCount(address account) external onlyAuthorized {
        walletMintCount[account]++;
    }

    // Same-opponent decay (plan §3.4): tracks consecutive battles against `opponentId` and
    // returns the XP-halving shift to apply (0 = full XP, 1 = half, 2 = quarter, ...).
    // Facing a different opponent resets the streak to 0.
    function recordBattleOpponent(
        uint256 petId,
        uint256 opponentId
    ) external onlyAuthorized entryExists(petId) returns (uint8 decayShift) {
        Pet storage p = _pets[petId];
        if (p.lastOpponentId == opponentId) {
            if (p.sameOpponentStreak < type(uint8).max) {
                p.sameOpponentStreak++;
            }
        } else {
            p.lastOpponentId = opponentId;
            p.sameOpponentStreak = 0;
        }
        decayShift = p.sameOpponentStreak;
    }

    // ─── user-facing functions ────────────────────────────────────────────────

    // @dev Starter minting lives in GameLogicV1 (requestMintStarter → settleMint): DNA is
    //      derived from a future Pyth Entropy reveal so rarity can't be ground out by
    //      retrying or reverting (plan §4.3). GameLogicV1 calls createPet/mintTo here.

    /// @notice Pay a level-scaled fee to raise a pet one level (no XP path), capped at maxLevel.
    /// @dev fee = levelUpFee * (100 + (level-1)^2) / 100 — a level-1 pet pays exactly
    ///      levelUpFee, and the cost grows quadratically as the pet levels up.
    /// @param tokenId The caller's pet to level up.
    function levelUp(uint256 tokenId) external payable whenNotPaused onlyPetOwner(tokenId) {
        uint32 level = _pets[tokenId].level;
        require(level < gameConfig.maxLevel(), "Already at max level");

        uint256 diff = level - 1;
        uint256 fee = gameConfig.levelUpFee() * (100 + diff * diff) / 100;
        require(msg.value >= fee, "Insufficient level-up fee");

        _pets[tokenId].level = level + 1;
        emit PetLevelUp(tokenId, _pets[tokenId].level);
    }

    /// @notice Rename a pet the caller owns; requires the pet to be at least NAME_CHANGE_LEVEL.
    /// @param tokenId The caller's pet.
    /// @param newName_ The new name (1..maxNameLength bytes).
    function changeName(
        uint256 tokenId,
        string memory newName_
    )
        external
        whenNotPaused
        onlyPetOwner(tokenId)
        aboveLevel(NAME_CHANGE_LEVEL, tokenId)
    {
        _requireValidName(newName_);
        _pets[tokenId].name = newName_;
        emit PetNameChanged(tokenId, newName_);
    }

    // ─── marriage system (plan §4.4) ─────────────────────────────────────────

    /// @notice Caller (owner of petIdA) proposes a mutual marriage with petIdB (different owner).
    /// @dev A live (unexpired) proposal from the current owner blocks a new one; expired or
    ///      prior-owner (stale) proposals are overwritten. Marriages invalidated by a transfer
    ///      are auto-dissolved here so the new owner isn't locked out.
    function proposeMarriage(
        uint256 petIdA,
        uint256 petIdB
    ) external whenNotPaused onlyPetOwner(petIdA) entryExists(petIdB) {
        require(petIdA != petIdB, "Cannot marry self");
        require(ownerOf(petIdA) != ownerOf(petIdB), "Same owner doesn't need marriage");

        // Clear any marriage already invalidated by a transfer; otherwise the leftover
        // spouseId would wrongly block the current owner from marrying this pet.
        _clearStaleMarriageFor(petIdA);
        _clearStaleMarriageFor(petIdB);

        require(marriageOf[petIdA].spouseId == 0, "petIdA already married");
        require(marriageOf[petIdB].spouseId == 0, "petIdB already married");
        require(block.timestamp >= marriageCooldownUntil[petIdA], "petIdA marriage cooldown active");
        require(block.timestamp >= marriageCooldownUntil[petIdB], "petIdB marriage cooldown active");

        Pet storage a = _pets[petIdA];
        Pet storage b = _pets[petIdB];
        require(
            a.parent1Id != petIdB && a.parent2Id != petIdB &&
            b.parent1Id != petIdA && b.parent2Id != petIdA,
            "Incest: cannot marry parent/child"
        );

        // onlyPetOwner(petIdA) ⇒ msg.sender == ownerOf(petIdA); a proposal whose proposer is
        // no longer that owner is stale and may be overwritten by the current owner.
        MarriageProposalData storage existing = marriageProposal[petIdA];
        require(
            existing.proposer == address(0) ||
            block.timestamp > existing.expiry ||
            existing.proposer != ownerOf(petIdA),
            "Pending proposal exists"
        );

        marriageProposal[petIdA] = MarriageProposalData({
            petIdB:   petIdB,
            proposer: msg.sender,
            expiry:   block.timestamp + gameConfig.proposalTTL()
        });
        emit MarriageProposed(petIdA, petIdB);
    }

    /// @notice Caller (owner of petIdB) accepts a matching, unexpired proposal from petIdA.
    /// @dev Re-checks that the stored proposer still owns petIdA (propose-then-sell guard) and
    ///      that neither pet is under a marriage cooldown (defends against a propose→marry-and-
    ///      divorce-elsewhere→accept sequence that would otherwise bypass the cooldown).
    function acceptMarriage(
        uint256 petIdA,
        uint256 petIdB
    ) external whenNotPaused onlyPetOwner(petIdB) entryExists(petIdA) {
        MarriageProposalData memory prop = marriageProposal[petIdA];
        require(prop.petIdB == petIdB, "No matching proposal");
        require(block.timestamp <= prop.expiry, "Proposal expired");
        require(ownerOf(petIdA) == prop.proposer, "Proposer no longer owns petIdA");
        require(marriageOf[petIdA].spouseId == 0, "petIdA already married");
        require(marriageOf[petIdB].spouseId == 0, "petIdB already married");
        require(block.timestamp >= marriageCooldownUntil[petIdA], "petIdA marriage cooldown active");
        require(block.timestamp >= marriageCooldownUntil[petIdB], "petIdB marriage cooldown active");

        marriageOf[petIdA] = MarriageRecord({ spouseId: petIdB, ownerSnapshot: ownerOf(petIdA) });
        marriageOf[petIdB] = MarriageRecord({ spouseId: petIdA, ownerSnapshot: ownerOf(petIdB) });
        delete marriageProposal[petIdA];

        emit MarriageAccepted(petIdA, petIdB);
    }

    /// @notice Proposer withdraws a pending proposal at any time (live or expired).
    function cancelProposal(uint256 petIdA) external whenNotPaused {
        require(marriageProposal[petIdA].proposer == msg.sender, "Not the proposer");
        delete marriageProposal[petIdA];
    }

    /// @notice Either spouse's owner dissolves the marriage immediately.
    /// @dev Both pets enter marriageCooldown before either can marry again (prevents propose/divorce spam).
    function divorce(uint256 petId) external whenNotPaused entryExists(petId) {
        require(ownerOf(petId) == msg.sender, "Not the owner of this pet");
        uint256 spouseId = marriageOf[petId].spouseId;
        require(spouseId != 0, "Not married");

        uint256 cooldownUntil = block.timestamp + gameConfig.marriageCooldown();
        marriageCooldownUntil[petId]    = cooldownUntil;
        marriageCooldownUntil[spouseId] = cooldownUntil;

        delete marriageOf[petId];
        delete marriageOf[spouseId];

        emit MarriageDissolved(petId, spouseId, "divorce");
    }

    /// @notice Permissionless cleanup of a marriage invalidated by a post-acceptance owner change.
    /// @dev No marriageCooldown penalty for stale dissolution (consent was broken by transfer, not divorce).
    function clearStaleMarriage(
        uint256 petIdA,
        uint256 petIdB
    ) external entryExists(petIdA) entryExists(petIdB) {
        MarriageRecord memory recA = marriageOf[petIdA];
        require(recA.spouseId == petIdB, "Not married to each other");
        MarriageRecord memory recB = marriageOf[petIdB];

        require(
            recA.ownerSnapshot != ownerOf(petIdA) || recB.ownerSnapshot != ownerOf(petIdB),
            "Marriage is not stale"
        );

        delete marriageOf[petIdA];
        delete marriageOf[petIdB];

        emit MarriageDissolved(petIdA, petIdB, "stale");
    }

    /// @dev Dissolve petId's marriage iff a transfer has invalidated either side's consent.
    ///      No marriageCooldown penalty (mirrors clearStaleMarriage). No-op if not married/not stale.
    function _clearStaleMarriageFor(uint256 petId) internal {
        uint256 spouseId = marriageOf[petId].spouseId;
        if (spouseId == 0) return;
        if (
            marriageOf[petId].ownerSnapshot != ownerOf(petId) ||
            marriageOf[spouseId].ownerSnapshot != ownerOf(spouseId)
        ) {
            delete marriageOf[petId];
            delete marriageOf[spouseId];
            emit MarriageDissolved(petId, spouseId, "stale");
        }
    }

    /// @notice True if petIdA and petIdB hold mutual, still-valid marriage records.
    /// @dev Valid means the owner snapshots taken at accept time still match current owners.
    function isMarriageValid(uint256 petIdA, uint256 petIdB) external view returns (bool) {
        MarriageRecord memory recA = marriageOf[petIdA];
        if (recA.spouseId != petIdB) return false;
        MarriageRecord memory recB = marriageOf[petIdB];
        if (recB.spouseId != petIdA) return false;
        return recA.ownerSnapshot == ownerOf(petIdA) && recB.ownerSnapshot == ownerOf(petIdB);
    }

    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── views ────────────────────────────────────────────────────────────────

    function getPet(uint256 petId) external view returns (Pet memory) {
        return _pets[petId];
    }

    function totalPets() external view returns (uint256) { return _petCount; }

    function isReady(uint256 petId) external view entryExists(petId) returns (bool) {
        return block.timestamp >= _pets[petId].readyTime;
    }

    function isBreedReady(uint256 petId) external view entryExists(petId) returns (bool) {
        return block.timestamp >= _pets[petId].breedReadyAt;
    }

    function isTrainReady(uint256 petId) external view entryExists(petId) returns (bool) {
        return block.timestamp >= _pets[petId].trainReadyAt;
    }

    function getPetStats(
        uint256 petId
    ) external view entryExists(petId) returns (uint32, uint16, uint16, uint8) {
        Pet memory p = _pets[petId];
        return (p.level, p.winCount, p.lossCount, p.rarity);
    }

    function getBreedInfo(
        uint256 petId
    ) external view entryExists(petId) returns (uint8 generation, uint8 breedCount, uint256 parent1Id, uint256 parent2Id) {
        Pet memory p = _pets[petId];
        return (p.generation, p.breedCount, p.parent1Id, p.parent2Id);
    }

    function getByOwner(address owner_) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](balanceOf(owner_));
        uint256 counter;
        for (uint256 i = 1; i <= _petCount; i++) {
            if (_exists(i) && ownerOf(i) == owner_) { result[counter++] = i; }
        }
        return result;
    }

    // ─── ERC-721 overrides ────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        return string(
            abi.encodePacked("https://api.cryptopets.io/metadata/", _toString(tokenId))
        );
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        super._beforeTokenTransfer(from, to, tokenId);
        if (from != address(0) && to != address(0)) {
            emit PetTransferred(tokenId, from, to);
        }
    }

    // ─── internal helpers ─────────────────────────────────────────────────────

    function _createPet(
        string memory name_,
        uint256 dna,
        uint8 rarity,
        uint8 generation,
        uint256 parent1Id,
        uint256 parent2Id
    ) private returns (uint256) {
        _petCount++;
        uint256 newId = _petCount;
        _pets[newId] = Pet({
            name:         name_,
            dna:          dna,
            level:        1,
            readyTime:    _deadline(gameConfig.battleCooldown()),
            winCount:     0,
            lossCount:    0,
            rarity:       rarity,
            xp:           0,
            generation:   generation,
            breedCount:   0,
            breedReadyAt: 0,  // breed-ready immediately; updated by triggerBreedCooldown
            trainReadyAt: 0,  // train-ready immediately
            speciesId:    _resolveSpecies(dna, rarity),
            parent1Id:    parent1Id,
            parent2Id:    parent2Id,
            lastOpponentId:     0,
            sameOpponentStreak: 0
        });
        emit NewPet(newId, name_, dna, rarity);
        return newId;
    }

    // Resolves a pet's species from its DNA digit pair 6 and rarity-tier pool size (plan §3.7).
    // Stored once at mint so later pool growth doesn't re-species existing pets.
    function _resolveSpecies(uint256 dna, uint8 rarity) private view returns (uint16) {
        uint8 poolSize = gameConfig.poolSizes(rarity);
        if (poolSize == 0) return 0;
        return uint16(DnaLib.digitPair(dna, 6) % poolSize);
    }

    // Compute a cooldown deadline, reverting rather than silently wrapping the uint32 the
    // Pet struct stores (cooldown fields are uint32; safe until the unix clock itself
    // exceeds 2^32 in ~2106, after which this reverts instead of producing a bogus time).
    function _deadline(uint256 cooldownSeconds) private view returns (uint32) {
        uint256 t = block.timestamp + cooldownSeconds;
        require(t <= type(uint32).max, "Cooldown overflows uint32");
        return uint32(t);
    }

    function _requireValidName(string memory name_) private view {
        uint256 len = bytes(name_).length;
        require(len > 0 && len <= gameConfig.maxNameLength(), "Invalid name length");
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value; uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (value != 0) { digits -= 1; buf[digits] = bytes1(uint8(48 + uint256(value % 10))); value /= 10; }
        return string(buf);
    }
}
