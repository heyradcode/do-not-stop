// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ZombieOwnership.sol";

/**
 * @title CryptoZombies
 * @dev Main contract that inherits all zombie functionality
 * @author Your Name
 */
contract CryptoZombies is ZombieOwnership {
    
    constructor() {
        // Constructor is handled by parent contracts
    }
    
    /**
     * @dev Get contract version
     * @return Version string
     */
    function getVersion() public pure returns (string memory) {
        return "2.0.0";
    }
    
    /**
     * @dev Get contract info
     * @return Contract name and symbol
     */
    function getContractInfo() public pure returns (string memory, string memory) {
        return ("CryptoZombies", "ZOMBIE");
    }
}
