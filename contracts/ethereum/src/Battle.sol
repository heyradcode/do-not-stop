// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Inventory.sol";
import "./Utils.sol";

/**
 * @title Battle
 * @dev PvP resolution; mutates Inventory via authorized calls.
 *      Callable only through the gateway (CryptoPets), which enforces pet
 *      ownership — Inventory trusts this contract, so direct calls must not
 *      bypass that check.
 */
contract Battle {
    event FightResult(uint256 petId1, uint256 petId2, bool firstWins);

    uint256 public constant ATTACK_VICTORY_PROBABILITY = 70;

    Inventory public inventory;
    Utils public utils;
    address public immutable gateway;

    constructor(address _inventory, address _utils, address _gateway) {
        inventory = Inventory(_inventory);
        utils = Utils(_utils);
        gateway = _gateway;
    }

    modifier onlyGateway() {
        require(msg.sender == gateway, "Only gateway");
        _;
    }

    function fight(uint256 _petId1, uint256 _petId2) external onlyGateway {
        require(
            _petId1 > 0 && _petId1 <= inventory.totalPets(),
            "First pet doesn't exist"
        );
        require(
            _petId2 > 0 && _petId2 <= inventory.totalPets(),
            "Second pet doesn't exist"
        );
        require(_petId1 != _petId2, "Can't fight self");

        require(inventory.isReady(_petId1), "First pet not ready");
        require(inventory.isReady(_petId2), "Second pet not ready");

        uint256 rand = utils.randMod(100);
        bool firstWins = rand <= ATTACK_VICTORY_PROBABILITY;

        if (firstWins) {
            inventory.updateBattleStats(_petId1, true);
            inventory.updateBattleStats(_petId2, false);
            inventory.levelUp(_petId1);
        } else {
            inventory.updateBattleStats(_petId2, true);
            inventory.updateBattleStats(_petId1, false);
            inventory.levelUp(_petId2);
        }

        inventory.triggerCooldown(_petId1);
        inventory.triggerCooldown(_petId2);

        emit FightResult(_petId1, _petId2, firstWins);
    }

    function attack(uint256 _petId, uint256 _targetId) external onlyGateway {
        require(
            _petId > 0 && _petId <= inventory.totalPets(),
            "Attacker doesn't exist"
        );
        require(
            _targetId > 0 && _targetId <= inventory.totalPets(),
            "Target doesn't exist"
        );
        require(_petId != _targetId, "Can't attack self");

        require(inventory.isReady(_petId), "Pet not ready");
        require(inventory.isReady(_targetId), "Enemy not ready");

        uint256 rand = utils.randMod(100);
        bool won = rand <= ATTACK_VICTORY_PROBABILITY;

        if (won) {
            inventory.updateBattleStats(_petId, true);
            inventory.updateBattleStats(_targetId, false);
            inventory.levelUp(_petId);
        } else {
            inventory.updateBattleStats(_petId, false);
            inventory.updateBattleStats(_targetId, true);
            inventory.triggerCooldown(_petId);
        }

        emit FightResult(_petId, _targetId, won);
    }

    function getBattleStats(
        uint256 _petId
    ) external view returns (uint16, uint16, uint256) {
        (, uint16 winCount, uint16 lossCount, ) = inventory.getPetStats(
            _petId
        );
        uint256 totalBattles = winCount + lossCount;
        uint256 winRate = totalBattles > 0
            ? (winCount * 100) / totalBattles
            : 0;
        return (winCount, lossCount, winRate);
    }
}
