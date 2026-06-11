// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

import "./Inventory.sol";
import "./Battle.sol";
import "./Breeding.sol";
import "./Utils.sol";

/**
 * @title CryptoPets
 * @dev ERC-721 facade over Inventory, Battle, Breeding, Utils. Breeding DNA uses Chainlink VRF.
 */
contract CryptoPets is ERC721, VRFConsumerBaseV2Plus {
    event BreedRandomnessRequested(
        address indexed owner,
        uint256 indexed requestId,
        uint256 petId1,
        uint256 petId2
    );
    event BreedFulfilled(
        address indexed owner,
        uint256 indexed childId,
        uint256 indexed requestId
    );
    event PetTransferred(uint256 tokenId, address from, address to);

    struct PendingBreed {
        address owner;
        uint256 petId1;
        uint256 petId2;
        string name;
    }

    Inventory public inventory;
    Battle public battleLogic;
    Breeding public breeding;
    Utils public utils;

    mapping(uint256 => PendingBreed) private s_breedRequests;
    /// @dev Non-zero while a VRF request including this pet is pending
    mapping(uint256 => uint256) public petBreedRequestId;

    uint256 private immutable i_vrfSubscriptionId;
    bytes32 private immutable i_vrfKeyHash;
    bool private immutable i_vrfNativePayment;

    uint32 private constant VRF_CALLBACK_GAS_LIMIT = 500_000;
    uint16 private constant VRF_REQUEST_CONFIRMATIONS = 3;
    uint32 private constant VRF_NUM_WORDS = 1;

    uint256 public constant LEVEL_UP_FEE = 0.001 ether;
    uint256 public constant NAME_CHANGE_LEVEL = 2;
    uint256 public constant MAX_NAME_LENGTH = 32;

    constructor(
        uint256 vrfSubscriptionId,
        bytes32 vrfKeyHash,
        address vrfCoordinator,
        bool vrfNativePayment
    ) ERC721("CryptoPets", "PETS") VRFConsumerBaseV2Plus(vrfCoordinator) {
        i_vrfSubscriptionId = vrfSubscriptionId;
        i_vrfKeyHash = vrfKeyHash;
        i_vrfNativePayment = vrfNativePayment;

        inventory = new Inventory();
        utils = new Utils();
        battleLogic = new Battle(
            address(inventory),
            address(utils),
            address(this)
        );
        breeding = new Breeding(
            address(inventory),
            address(utils),
            address(this)
        );

        inventory.authorizeCaller(address(breeding));
        inventory.authorizeCaller(address(battleLogic));
    }

    modifier onlyPetOwner(uint256 _tokenId) {
        require(
            ownerOf(_tokenId) == msg.sender,
            "Not the owner of this pet"
        );
        _;
    }

    modifier aboveLevel(uint256 _level, uint256 _tokenId) {
        (uint32 level, , , ) = inventory.getPetStats(_tokenId);
        require(level >= _level, "Pet level too low");
        _;
    }

    modifier validName(string memory _name) {
        uint256 len = bytes(_name).length;
        require(len > 0 && len <= MAX_NAME_LENGTH, "Invalid name length");
        _;
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }

        if (to != address(0)) {
            emit PetTransferred(tokenId, from, to);
        }

        return super._update(to, tokenId, auth);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return
            string(
                abi.encodePacked(
                    "https://api.cryptopets.io/metadata/",
                    _toString(tokenId)
                )
            );
    }

    function createRandom(string memory _name) public validName(_name) {
        require(balanceOf(msg.sender) == 0, "You already have a pet!");

        uint256 randDna = utils.generateRandomDna(_name);
        // Interim Phase-0 clamp (plan §6 EVM #9): force starter rarity to 1
        // regardless of rolled DNA. Full removal of createRandom lands with
        // the gacha mint in Phase 3.
        uint8 rarity = 1;

        uint256 newId = inventory.createPet(_name, randDna, rarity);
        _safeMint(msg.sender, newId);
    }

    /**
     * @notice Request verifiable randomness to breed two pets. Fulfills asynchronously via VRF.
     * @dev Fund the VRF subscription (LINK or native per `i_vrfNativePayment`) before calling.
     */
    function requestCreateFromDNA(
        uint256 _petId1,
        uint256 _petId2,
        string calldata _name
    ) external validName(_name) returns (uint256 requestId) {
        breeding.assertCanBreed(_petId1, _petId2);
        require(
            petBreedRequestId[_petId1] == 0 && petBreedRequestId[_petId2] == 0,
            "Breed pending for parent"
        );

        VRFV2PlusClient.ExtraArgsV1 memory extraArgs = VRFV2PlusClient.ExtraArgsV1({
            nativePayment: i_vrfNativePayment
        });

        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: i_vrfKeyHash,
                subId: i_vrfSubscriptionId,
                requestConfirmations: VRF_REQUEST_CONFIRMATIONS,
                callbackGasLimit: VRF_CALLBACK_GAS_LIMIT,
                numWords: VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(extraArgs)
            })
        );

        petBreedRequestId[_petId1] = requestId;
        petBreedRequestId[_petId2] = requestId;
        s_breedRequests[requestId] = PendingBreed({
            owner: msg.sender,
            petId1: _petId1,
            petId2: _petId2,
            name: _name
        });

        emit BreedRandomnessRequested(msg.sender, requestId, _petId1, _petId2);
    }

    /// @notice VRF *callback* (consumer side). The coordinator calls this with `randomWords`.
    /// @dev Not the same as `VRFCoordinatorV2_5Mock.fulfillRandomWords(uint256,address)`:
    ///      that coordinator method takes `(requestId, consumer)` and then invokes this callback.
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        PendingBreed memory pending = s_breedRequests[requestId];
        require(pending.owner != address(0), "No pending breed");
        require(randomWords.length > 0, "No random words");

        breeding.completeBreedWithVrf(
            pending.petId1,
            pending.petId2,
            pending.name,
            randomWords[0]
        );

        uint256 childId = inventory.totalPets();
        // Use _mint, not _safeMint: a malicious/buggy ERC721Receiver could
        // otherwise revert this VRF callback and permanently burn the request.
        _mint(pending.owner, childId);

        petBreedRequestId[pending.petId1] = 0;
        petBreedRequestId[pending.petId2] = 0;
        delete s_breedRequests[requestId];

        emit BreedFulfilled(pending.owner, childId, requestId);
    }

    function attack(uint256 _petId, uint256 _targetId)
        public
        onlyPetOwner(_petId)
    {
        battleLogic.attack(_petId, _targetId);
    }

    function levelUp(uint256 _tokenId)
        public
        payable
        onlyPetOwner(_tokenId)
    {
        require(msg.value == LEVEL_UP_FEE, "Incorrect fee amount");
        inventory.levelUp(_tokenId);
    }

    function changeName(
        uint256 _tokenId,
        string memory _newName
    )
        public
        onlyPetOwner(_tokenId)
        aboveLevel(NAME_CHANGE_LEVEL, _tokenId)
        validName(_newName)
    {
        inventory.changeName(_tokenId, _newName);
    }

    function getById(uint256 _tokenId)
        public
        view
        returns (Inventory.Pet memory)
    {
        return inventory.getPet(_tokenId);
    }

    function getTotalCount() public view returns (uint256) {
        return inventory.totalPets();
    }

    function getStats(
        uint256 _tokenId
    ) public view returns (uint32, uint16, uint16, uint8) {
        return inventory.getPetStats(_tokenId);
    }

    function getBattleStats(
        uint256 _tokenId
    ) public view returns (uint16, uint16, uint256) {
        return battleLogic.getBattleStats(_tokenId);
    }

    function getByOwner(address owner)
        public
        view
        returns (uint256[] memory)
    {
        uint256[] memory result = new uint256[](balanceOf(owner));
        uint256 counter = 0;

        for (uint256 i = 1; i <= getTotalCount(); i++) {
            if (_ownerOf(i) == owner) {
                result[counter] = i;
                counter++;
            }
        }

        return result;
    }

    function battle(uint256 _id1, uint256 _id2) public onlyPetOwner(_id1) {
        battleLogic.fight(_id1, _id2);
    }

    function withdraw() public onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
