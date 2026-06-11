// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "./GameConfig.sol";
import "./CombatSimV1.sol";
import "./PetCoreV1.sol";
import "./GameLogicV1.sol";

/**
 * @title LocalCryptoPetsDeployerV2
 * @dev Single-transaction local deployer for the v2 UUPS proxy stack.
 *      Deploys VRF mock → GameConfig → CombatSimV1 → PetCoreV1 proxy → GameLogicV1 proxy.
 *      Ownership starts with address(this) so wiring calls succeed, then transfers to msg.sender.
 *      Not for production — testnets use the Hardhat Ignition module with real coordinators.
 */
contract LocalCryptoPetsDeployerV2 {
    VRFCoordinatorV2_5Mock public immutable vrfCoordinator;
    uint256                public immutable subscriptionId;

    GameConfig   public immutable config;
    CombatSimV1  public immutable combatSim;
    PetCoreV1    public immutable petCore;    // proxy, typed as impl for convenience
    GameLogicV1  public immutable gameLogic;  // proxy, typed as impl for convenience

    constructor() payable {
        address finalOwner = msg.sender;

        // ── VRF mock ──────────────────────────────────────────────────────────
        vrfCoordinator = new VRFCoordinatorV2_5Mock(
            uint96(0.1 ether),
            uint96(1 gwei),
            int256(4e15)
        );
        subscriptionId = vrfCoordinator.createSubscription();

        // ── config & sim ──────────────────────────────────────────────────────
        config    = new GameConfig(address(this));
        combatSim = new CombatSimV1();
        config.setCombatSim(address(combatSim));

        bytes32 keyHash = keccak256(abi.encodePacked("CryptoPets-local-vrf"));

        // ── PetCoreV1 proxy — owner starts as address(this) for wiring ────────
        PetCoreV1 petCoreImpl = new PetCoreV1();
        bytes memory petCoreInit = abi.encodeCall(
            PetCoreV1.initialize,
            (address(config), address(this))
        );
        ERC1967Proxy petCoreProxy = new ERC1967Proxy(address(petCoreImpl), petCoreInit);
        petCore = PetCoreV1(address(petCoreProxy));

        // ── GameLogicV1 proxy — owner starts as address(this) for wiring ──────
        GameLogicV1 gameLogicImpl = new GameLogicV1();
        bytes memory gameLogicInit = abi.encodeCall(
            GameLogicV1.initialize,
            (
                address(vrfCoordinator),
                address(petCore),
                address(config),
                subscriptionId,
                keyHash,
                true,       // nativePayment
                address(this)
            )
        );
        ERC1967Proxy gameLogicProxy = new ERC1967Proxy(address(gameLogicImpl), gameLogicInit);
        gameLogic = GameLogicV1(address(gameLogicProxy));

        // ── wire up (deployer is still owner of both proxies here) ────────────
        petCore.authorizeCaller(address(gameLogic));
        vrfCoordinator.addConsumer(subscriptionId, address(gameLogic));
        if (msg.value > 0) {
            vrfCoordinator.fundSubscriptionWithNative{value: msg.value}(subscriptionId);
        }

        // ── hand off ownership to the EOA that deployed this contract ─────────
        petCore.transferOwnership(finalOwner);
        gameLogic.transferOwnership(finalOwner);
        config.transferOwnership(finalOwner);
    }
}
