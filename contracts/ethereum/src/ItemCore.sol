// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title ItemCore
 * @dev UUPS-upgradeable ERC-1155 holding every inventory item (roadmap §4).
 *
 *      Semi-fungible on purpose: a pet is a one-of-one ERC-721 in PetCore, but many
 *      players own the same XP potion, so the token id here is the *item type* and the
 *      balance is how many of it a wallet holds. That is what keeps a catalog of 20 items
 *      and a catalog of 2,000 the same cost on chain: only the numeric type id is stored
 *      here, while names, art and effects live in the backend catalog.
 *
 *      What is deliberately NOT here: item effects. An XP potion's grant, a sword's stat
 *      modifier, the rarity tier, all of it is backend-managed content, versioned by the
 *      battle protocol's `itemCatalogHash` rather than by this contract. Putting effects on
 *      chain would make every rebalance a transaction, and §4's open decision came down on
 *      the side of the existing GameConfig pattern: balance knobs stay owner-tunable off the
 *      asset contract.
 *
 *      Storage layout is append-only, with new variables taking a slot off `__gap` rather
 *      than being appended after it.
 */
contract ItemCore is ERC1155Upgradeable, ERC1155HolderUpgradeable, UUPSUpgradeable, OwnableUpgradeable {
    string public constant VERSION = "1.0.0";

    event ItemsMinted(address indexed to, uint256 indexed itemType, uint256 quantity);
    event ItemsBurned(address indexed from, uint256 indexed itemType, uint256 quantity);
    event ItemEquipped(uint256 indexed petId, uint8 indexed slot, uint256 indexed itemType, address owner);
    event ItemUnequipped(uint256 indexed petId, uint8 indexed slot, uint256 indexed itemType, address owner);
    event ItemSlotRegistered(uint256 indexed itemType, uint8 slot);
    event ItemSlotCleared(uint256 indexed itemType);
    event CallerAuthorized(address indexed caller);
    event CallerRevoked(address indexed caller);
    event ItemUriUpdated(string uri);

    /// @dev Used by uri() until an owner calls setUri. ERC-1155 clients substitute the
    ///      lowercase hex item type for `{id}` themselves; the contract never does.
    string public constant DEFAULT_ITEM_URI = "https://api.cryptopets.io/items/{id}.json";

    /// @dev Equip slots. Three gear slots and no cosmetic one: cosmetics are out of the v1
    ///      catalog, and a slot nothing can go in is a layout decision made for a feature
    ///      whose shape is undecided. Adding a fourth later costs nothing here, since the
    ///      slot is a mapping key rather than a struct field.
    uint8 public constant SLOT_WEAPON = 0;
    uint8 public constant SLOT_ARMOR = 1;
    uint8 public constant SLOT_TRINKET = 2;
    uint8 public constant SLOT_COUNT = 3;

    mapping(address => bool) public authorizedCallers;

    /// @dev PetCore proxy, read when equipping to check who owns the pet being geared.
    ///      Set at initialize so the deployment wiring never has to change; see equip().
    address public petCore;

    /// @dev Which slot an item type may occupy, stored as slot + 1 so that the zero value
    ///      means "not equippable" rather than "weapon". Read `slotOf` instead of this.
    ///
    ///      The one piece of catalog data that has to be on chain: without it the contract
    ///      cannot tell a sword from an XP potion, and escrowing a consumable into a weapon
    ///      slot would lock it where nothing will ever read it. Effects stay off chain.
    mapping(uint256 => uint8) private _itemSlotPlusOne;

    /// @dev petId => slot => equipped item type, 0 for an empty slot. Item type 0 is
    ///      therefore not equippable, which `registerItemSlot` enforces.
    mapping(uint256 => mapping(uint8 => uint256)) private _equipped;

    // Reserve 46 slots: 4 declared above + 46 gap = 50 for ItemCore's scope.
    uint256[46] private __gap;

    // ─── modifiers ────────────────────────────────────────────────────────────

    /// @dev Same shape as PetCore's: the owner, or a contract/wallet the owner has
    ///      authorized. In practice the authorized caller is the backend's item wallet.
    ///      This is a real trust grant, not a formality: an authorized caller can burn any
    ///      wallet's items without that wallet's approval, which is what lets the backend
    ///      settle a consumable in one call after the player has already authenticated to
    ///      it. Nothing here constrains that caller; the constraint is who the owner
    ///      authorizes.
    modifier onlyAuthorized() {
        require(msg.sender == owner() || authorizedCallers[msg.sender], "Not authorized");
        _;
    }

    // ─── constructor / initializer ────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers(); // implementation must never be initialized directly
    }

    function initialize(address petCore_, address initialOwner) public initializer {
        __ERC1155_init(DEFAULT_ITEM_URI);
        __ERC1155Holder_init();
        __UUPSUpgradeable_init();
        __Ownable_init();
        _transferOwnership(initialOwner);
        petCore = petCore_;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @dev Both bases declare it: ERC-1155 for the token interface, the holder for the
    ///      receiver interface. This contract is genuinely both, so neither is dropped.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155Upgradeable, ERC1155ReceiverUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ─── owner configuration ──────────────────────────────────────────────────

    /// @notice Point item metadata at a service. The `{id}` placeholder is substituted by
    ///         the client, per ERC-1155, so the value must contain it to be useful. Not
    ///         validated here: a wrong value is visible in the next uri() read and fixed by
    ///         calling this again.
    function setUri(string calldata newUri) external onlyOwner {
        _setURI(newUri);
        emit ItemUriUpdated(newUri);
    }

    /// @notice Repoint at a newly deployed PetCore. Only affects future equip calls, since
    ///         equipment is keyed by pet id and nothing here stores a resolved owner.
    function setPetCore(address petCore_) external onlyOwner {
        require(petCore_ != address(0), "Zero address");
        petCore = petCore_;
    }

    // ─── caller authorization ─────────────────────────────────────────────────

    function authorizeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = true;
        emit CallerAuthorized(caller);
    }

    function revokeCaller(address caller) external onlyOwner {
        authorizedCallers[caller] = false;
        emit CallerRevoked(caller);
    }

    // ─── equip slot registry ──────────────────────────────────────────────────

    /// @notice Declare that `itemType` is equipment for `slot`.
    /// @dev    Owner-gated rather than authorized-caller-gated: this is catalog shape, not
    ///         gameplay, and it is the one item property the contract itself enforces.
    ///         Re-registering an item type to a different slot is allowed and does not
    ///         disturb anything already equipped, which stays where it was put until
    ///         unequipped.
    function registerItemSlot(uint256 itemType, uint8 slot) external onlyOwner {
        require(itemType != 0, "Item type 0 reserved");
        require(slot < SLOT_COUNT, "Unknown slot");
        _itemSlotPlusOne[itemType] = slot + 1;
        emit ItemSlotRegistered(itemType, slot);
    }

    /// @notice Stop treating `itemType` as equipment. Already-equipped copies are not
    ///         disturbed; they simply cannot be re-equipped after being removed.
    function clearItemSlot(uint256 itemType) external onlyOwner {
        delete _itemSlotPlusOne[itemType];
        emit ItemSlotCleared(itemType);
    }

    /// @notice The slot `itemType` occupies, and whether it is equipment at all.
    function slotOf(uint256 itemType) public view returns (bool isEquipment, uint8 slot) {
        uint8 stored = _itemSlotPlusOne[itemType];
        return stored == 0 ? (false, 0) : (true, stored - 1);
    }

    // ─── equipment ────────────────────────────────────────────────────────────

    /// @notice Equip one `itemType` onto `petId`, escrowing it in this contract.
    ///
    /// @dev    Escrow, not a transfer lock. The item leaves the player's balance, which
    ///         costs some wallet-UI visibility, and buys two things worth more. First, the
    ///         equip mapping is itself the ownership proof, so "was this gear really on this
    ///         pet at snapshot time" is answered by chain state at a recorded version rather
    ///         than by a backend row nobody else can check (roadmap §4). Second, one copy of
    ///         an item cannot buff two pets, without needing a locked-balance invariant that
    ///         breaks the moment a geared pet changes hands.
    ///
    ///         Gear follows the pet, deliberately: unequip returns it to whoever owns the pet
    ///         then, not to whoever equipped it. A transfer-locked design would instead
    ///         strand the item in the old owner's wallet, locked by a pet they no longer own.
    function equip(uint256 petId, uint8 slot, uint256 itemType) external {
        require(msg.sender == _petOwner(petId), "Not the owner of this pet");
        (bool isEquipment, uint8 itemSlot) = slotOf(itemType);
        require(isEquipment, "Item is not equipment");
        require(itemSlot == slot, "Wrong slot for this item");
        require(_equipped[petId][slot] == 0, "Slot already filled");

        _equipped[petId][slot] = itemType;
        // Reverts on an insufficient balance, so holding the item is checked here rather
        // than by a separate require that could disagree with the transfer.
        _safeTransferFrom(msg.sender, address(this), itemType, 1, "");
        emit ItemEquipped(petId, slot, itemType, msg.sender);
    }

    /// @notice Return the item in `petId`'s `slot` to the pet's current owner.
    function unequip(uint256 petId, uint8 slot) external {
        address petOwner = _petOwner(petId);
        require(msg.sender == petOwner, "Not the owner of this pet");
        uint256 itemType = _equipped[petId][slot];
        require(itemType != 0, "Slot is empty");

        delete _equipped[petId][slot];
        _safeTransferFrom(address(this), petOwner, itemType, 1, "");
        emit ItemUnequipped(petId, slot, itemType, petOwner);
    }

    /// @notice Everything equipped on `petId`, indexed by slot. 0 means an empty slot.
    /// @dev    The read the indexer projects into `pet_equipment` and the battle snapshot
    ///         resolves modifiers from.
    function equipmentOf(uint256 petId) external view returns (uint256[SLOT_COUNT] memory items) {
        for (uint8 slot = 0; slot < SLOT_COUNT; slot++) {
            items[slot] = _equipped[petId][slot];
        }
    }

    /// @notice The item equipped in one slot, or 0.
    function equippedItem(uint256 petId, uint8 slot) external view returns (uint256) {
        return _equipped[petId][slot];
    }

    function _petOwner(uint256 petId) private view returns (address) {
        require(petCore != address(0), "PetCore not set");
        return IERC721Upgradeable(petCore).ownerOf(petId);
    }

    // ─── authorized mutators (called by the backend item wallet) ──────────────

    /// @notice Mint `quantity` of `itemType` to `to`.
    /// @dev    The single acquisition path in v1: an admin grant and a claimed battle drop
    ///         both land here. Crates and marketplace purchases are later features that
    ///         would call this the same way.
    function mintTo(address to, uint256 itemType, uint256 quantity) external onlyAuthorized {
        require(to != address(0), "Zero address");
        require(quantity > 0, "Zero quantity");
        _mint(to, itemType, quantity, "");
        emit ItemsMinted(to, itemType, quantity);
    }

    /// @notice Burn `quantity` of `itemType` from `from`.
    /// @dev    Consumables are burned here after the backend has applied their effect, so
    ///         the burn is the record that the effect was spent. Reverts on an insufficient
    ///         balance, which is what keeps a double-spend of one potion from settling
    ///         twice even if the backend asked for it.
    function burnFrom(address from, uint256 itemType, uint256 quantity) external onlyAuthorized {
        require(quantity > 0, "Zero quantity");
        _burn(from, itemType, quantity);
        emit ItemsBurned(from, itemType, quantity);
    }
}
