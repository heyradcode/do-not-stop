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
    }

    function revokeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
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
        _pets[petId].readyTime = uint32(block.timestamp + gameConfig.battleCooldown());
    }

    // Set the breed-specific cooldown (does NOT touch the battle readyTime).
    function triggerBreedCooldown(
        uint256 petId,
        uint256 cooldownSeconds
    ) external onlyAuthorized entryExists(petId) {
        _pets[petId].breedReadyAt = uint32(block.timestamp + cooldownSeconds);
    }

    // Override battle readyTime directly (used for newborn cooldown on bred pets).
    function setCooldown(uint256 petId, uint256 cooldownSeconds) external onlyAuthorized entryExists(petId) {
        _pets[petId].readyTime = uint32(block.timestamp + cooldownSeconds);
    }

    // Set the train-specific cooldown.
    function triggerTrainCooldown(uint256 petId) external onlyAuthorized entryExists(petId) {
        _pets[petId].trainReadyAt = uint32(block.timestamp + gameConfig.trainCooldown());
    }

    function updateBattleStats(uint256 petId, bool won) external onlyAuthorized entryExists(petId) {
        if (won) { _pets[petId].winCount++; } else { _pets[petId].lossCount++; }
    }

    function levelUpInternal(uint256 petId) external onlyAuthorized entryExists(petId) {
        _pets[petId].level++;
        emit PetLevelUp(petId, _pets[petId].level);
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

    // ─── user-facing functions ────────────────────────────────────────────────

    // Gacha starter mint (Phase 3): replaces the one-per-wallet createRandom.
    // Fee escalates with each mint from this wallet: baseMintFee * (1 + mintCount).
    // Rarity is derived from DNA digit pair 0 (DnaLib.rarityFromDna, 50/25/15/8/2 split).
    // WARNING: DNA entropy is block-derived (grindable, plan §4.3) — see security notes;
    // the plan's final form requests DNA from VRF like breeding does.
    function mintStarter(string memory name_) external payable whenNotPaused {
        _requireValidName(name_);
        uint256 mintCount = walletMintCount[msg.sender];
        uint256 fee = gameConfig.baseMintFee() * (1 + mintCount);
        require(msg.value >= fee, "Insufficient mint fee");
        walletMintCount[msg.sender] = mintCount + 1;

        uint256 randDna = uint256(
            keccak256(abi.encodePacked(name_, block.timestamp, block.prevrandao, mintCount))
        ) % DNA_MODULUS;
        uint8 rarity = DnaLib.rarityFromDna(randDna);

        uint256 newId = _createPet(name_, randDna, rarity, 0, 0, 0);
        _mint(msg.sender, newId);
    }

    function levelUp(uint256 tokenId) external payable whenNotPaused onlyPetOwner(tokenId) {
        require(msg.value == gameConfig.levelUpFee(), "Incorrect fee amount");
        _pets[tokenId].level++;
        emit PetLevelUp(tokenId, _pets[tokenId].level);
    }

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

    // Caller owns petIdA and proposes a mutual marriage with petIdB (different owner).
    // Overwrites any expired proposal from petIdA; a live (unexpired) proposal blocks a new one.
    function proposeMarriage(
        uint256 petIdA,
        uint256 petIdB
    ) external whenNotPaused onlyPetOwner(petIdA) entryExists(petIdB) {
        require(petIdA != petIdB, "Cannot marry self");
        require(ownerOf(petIdA) != ownerOf(petIdB), "Same owner doesn't need marriage");
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

        MarriageProposalData storage existing = marriageProposal[petIdA];
        require(
            existing.proposer == address(0) || block.timestamp > existing.expiry,
            "Pending proposal exists"
        );

        marriageProposal[petIdA] = MarriageProposalData({
            petIdB:   petIdB,
            proposer: msg.sender,
            expiry:   block.timestamp + gameConfig.proposalTTL()
        });
        emit MarriageProposed(petIdA, petIdB);
    }

    // Caller owns petIdB and accepts a matching, unexpired proposal from petIdA.
    // Re-checks that the stored proposer still owns petIdA (propose-then-sell guard).
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

        marriageOf[petIdA] = MarriageRecord({ spouseId: petIdB, ownerSnapshot: ownerOf(petIdA) });
        marriageOf[petIdB] = MarriageRecord({ spouseId: petIdA, ownerSnapshot: ownerOf(petIdB) });
        delete marriageProposal[petIdA];

        emit MarriageAccepted(petIdA, petIdB);
    }

    // Proposer withdraws a pending proposal at any time (live or expired).
    function cancelProposal(uint256 petIdA) external whenNotPaused {
        require(marriageProposal[petIdA].proposer == msg.sender, "Not the proposer");
        delete marriageProposal[petIdA];
    }

    // Either spouse's owner dissolves the marriage immediately. Both pets enter
    // marriageCooldown before either can marry again (prevents propose/divorce spam).
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

    // Permissionless cleanup: either pet's owner has changed since the marriage was
    // accepted, invalidating consent. No marriageCooldown penalty for stale dissolution.
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

    // True if petIdA and petIdB hold mutual, still-valid marriage records
    // (owner snapshots still match current owners).
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
            readyTime:    uint32(block.timestamp + gameConfig.battleCooldown()),
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
            parent2Id:    parent2Id
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
