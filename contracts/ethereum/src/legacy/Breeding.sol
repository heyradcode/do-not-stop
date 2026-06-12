// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Inventory.sol";
import "./Utils.sol";

/**
 * @title Breeding
 * @dev Parents must be ready; DNA randomness comes from Chainlink VRF via vrfFulfillGateway
 * @custom:deprecated LEGACY v1 stack. Replaced by GameLogicV1 breeding (generations,
 *      lineage, mutation mixing, store-then-settle) per plan §4. Do not extend.
 */
contract Breeding {
    event Bred(uint256 parentId1, uint256 parentId2, uint256 childId);

    Inventory public inventory;
    Utils public utils;
    address public immutable vrfFulfillGateway;

    constructor(
        address _inventory,
        address _utils,
        address _vrfFulfillGateway
    ) {
        inventory = Inventory(_inventory);
        utils = Utils(_utils);
        vrfFulfillGateway = _vrfFulfillGateway;
    }

    function assertCanBreed(uint256 _petId1, uint256 _petId2) external view {
        _validateBreedPair(_petId1, _petId2);
    }

    function _validateBreedPair(
        uint256 _petId1,
        uint256 _petId2
    ) internal view {
        require(
            _petId1 > 0 && _petId1 <= inventory.totalPets(),
            "First pet doesn't exist"
        );
        require(
            _petId2 > 0 && _petId2 <= inventory.totalPets(),
            "Second pet doesn't exist"
        );
        require(_petId1 != _petId2, "Can't breed with self");
        require(inventory.isReady(_petId1), "First parent not ready");
        require(inventory.isReady(_petId2), "Second parent not ready");
    }

    function completeBreedWithVrf(
        uint256 _petId1,
        uint256 _petId2,
        string memory _name,
        uint256 _vrfRandomWord
    ) external {
        require(msg.sender == vrfFulfillGateway, "Only VRF gateway");
        _validateBreedPair(_petId1, _petId2);

        Inventory.Pet memory p1 = inventory.getPet(_petId1);
        Inventory.Pet memory p2 = inventory.getPet(_petId2);

        uint256 newDna = utils.mixDnaWithVrfWord(
            p1.dna,
            p2.dna,
            _vrfRandomWord
        );
        uint8 rarity = utils.calculateRarity(newDna);

        uint256 childId = inventory.createPet(_name, newDna, rarity);

        inventory.triggerCooldown(_petId1);
        inventory.triggerCooldown(_petId2);

        emit Bred(_petId1, _petId2, childId);
    }
}
