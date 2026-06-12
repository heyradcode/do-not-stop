// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { VRFCoordinatorV2_5Mock } from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";

import "./CryptoPets.sol";

/**
 * @title LocalCryptoPetsDeployer
 * @dev Single tx for local Hardhat: VRF v2.5 mock, subscription, funded native balance, CryptoPets as consumer.
 *      Send `msg.value` to seed the subscription (e.g. 100 ether). For testnets, deploy `CryptoPets` with real coordinator args.
 * @custom:deprecated LEGACY v1 stack deployer. The v2 UUPS proxy stack deploys via
 *      LocalCryptoPetsDeployerV2 (local) / ignition/modules/CryptoPetsV2Live.ts (live).
 */
contract LocalCryptoPetsDeployer {
    VRFCoordinatorV2_5Mock public immutable vrfCoordinator;
    CryptoPets public immutable cryptoPets;
    uint256 public immutable subscriptionId;

    constructor() payable {
        vrfCoordinator = new VRFCoordinatorV2_5Mock(
            uint96(0.1 ether),
            uint96(1 gwei),
            int256(4e15)
        );
        subscriptionId = vrfCoordinator.createSubscription();
        bytes32 keyHash = keccak256(abi.encodePacked("CryptoPets-local-vrf"));
        cryptoPets = new CryptoPets(
            subscriptionId,
            keyHash,
            address(vrfCoordinator),
            true
        );
        vrfCoordinator.addConsumer(subscriptionId, address(cryptoPets));
        if (msg.value > 0) {
            vrfCoordinator.fundSubscriptionWithNative{value: msg.value}(
                subscriptionId
            );
        }
    }
}
