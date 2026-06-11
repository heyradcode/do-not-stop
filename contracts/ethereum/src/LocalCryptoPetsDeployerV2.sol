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
 *      Accepts a pre-deployed VRF coordinator and subscription so the heavy
 *      VRFCoordinatorV2_5Mock bytecode does not inflate this contract's initcode
 *      past the EIP-3860 limit.
 *
 *      Usage (TypeScript tests):
 *        1. Deploy VRFCoordinatorV2_5Mock, createSubscription, fundSubscription.
 *        2. Deploy this contract, passing (coordinator, subscriptionId).
 *        3. Call coordinator.addConsumer(subId, deployer.gameLogic).
 *
 *      Not for production — testnets use the Hardhat Ignition module with real coordinators.
 */
contract LocalCryptoPetsDeployerV2 {
    address    public immutable vrfCoordinator;
    uint256    public immutable subscriptionId;

    GameConfig   public immutable config;
    CombatSimV1  public immutable combatSim;
    PetCoreV1    public immutable petCore;    // proxy, typed as impl for convenience
    GameLogicV1  public immutable gameLogic;  // proxy, typed as impl for convenience

    constructor(address vrfCoordinator_, uint256 subscriptionId_) payable {
        address finalOwner = msg.sender;
        vrfCoordinator = vrfCoordinator_;
        subscriptionId = subscriptionId_;

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
                vrfCoordinator_,
                address(petCore),
                address(config),
                subscriptionId_,
                keyHash,
                true,        // nativePayment
                address(this)
            )
        );
        ERC1967Proxy gameLogicProxy = new ERC1967Proxy(address(gameLogicImpl), gameLogicInit);
        gameLogic = GameLogicV1(address(gameLogicProxy));

        // ── wire up (deployer is still owner of both proxies here) ────────────
        petCore.authorizeCaller(address(gameLogic));
        // addConsumer is called by the test after deployment so the coordinator
        // reference is not needed here (avoids importing the mock interface).

        // ── hand off ownership to the EOA that deployed this contract ─────────
        petCore.transferOwnership(finalOwner);
        gameLogic.transferOwnership(finalOwner);
        config.transferOwnership(finalOwner);
    }
}
