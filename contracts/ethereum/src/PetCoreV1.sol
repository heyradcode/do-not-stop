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
        uint256 parent1Id;   // 0 for gen-0 pets
        uint256 parent2Id;   // 0 for gen-0 pets
    }

    uint256 public constant DNA_DIGITS  = 16;
    uint256 public constant DNA_MODULUS = 10 ** DNA_DIGITS;
    uint256 public constant NAME_CHANGE_LEVEL = 2;

    uint256 private _petCount;
    mapping(uint256 => Pet)   private _pets;
    mapping(address => bool)  public  authorizedCallers;
    GameConfig                public  gameConfig;
    mapping(address => uint256) public walletMintCount; // total lifetime mints per wallet

    // Reserve 44 slots: 5 declared above (through walletMintCount) + 44 gap = 49 for PetCoreV1's scope.
    uint256[44] private __gap;

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

    // ─── initializer ──────────────────────────────────────────────────────────

    function initialize(address gameConfig_, address initialOwner) public initializer {
        __ERC721_init("CryptoPets", "PETS");
        __ERC721Pausable_init();
        __UUPSUpgradeable_init();
        __Ownable_init();
        __Pausable_init();
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

    function updateBattleStats(uint256 petId, bool won) external onlyAuthorized entryExists(petId) {
        if (won) { _pets[petId].winCount++; } else { _pets[petId].lossCount++; }
    }

    function levelUpInternal(uint256 petId) external onlyAuthorized entryExists(petId) {
        _pets[petId].level++;
        emit PetLevelUp(petId, _pets[petId].level);
    }

    function addXp(uint256 petId, uint32 amount) external onlyAuthorized entryExists(petId) {
        Pet storage p = _pets[petId];
        p.xp += amount;
        uint32 threshold = 100 * p.level;
        if (p.xp >= threshold) {
            p.xp -= threshold;
            p.level++;
            emit PetLevelUp(petId, p.level);
        }
    }

    function incrementBreedCount(uint256 petId) external onlyAuthorized entryExists(petId) {
        _pets[petId].breedCount++;
    }

    // ─── user-facing functions ────────────────────────────────────────────────

    // Gacha starter mint (Phase 3): replaces the one-per-wallet createRandom.
    // Fee escalates with each mint from this wallet: baseMintFee * (1 + mintCount).
    // Rarity is determined from DNA pair 7 (digits 14-15).
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
            name:       name_,
            dna:        dna,
            level:      1,
            readyTime:  uint32(block.timestamp + gameConfig.battleCooldown()),
            winCount:   0,
            lossCount:  0,
            rarity:       rarity,
            xp:           0,
            generation:   generation,
            breedCount:   0,
            breedReadyAt: 0,   // breed-ready immediately; updated by triggerBreedCooldown
            parent1Id:    parent1Id,
            parent2Id:    parent2Id
        });
        emit NewPet(newId, name_, dna, rarity);
        return newId;
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
