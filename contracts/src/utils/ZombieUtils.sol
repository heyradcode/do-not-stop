// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ZombieUtils
 * @dev Pure utility functions for zombie operations
 */
contract ZombieUtils {
    // Constants
    uint256 public constant DNA_DIGITS = 16;
    uint256 public constant DNA_MODULUS = 10 ** DNA_DIGITS;

    // State for random number generation
    uint256 private randNonce = 0;

    /**
     * @dev Generate random DNA based on name and block data
     */
    function generateRandomDna(
        string memory _name
    ) external view returns (uint256) {
        uint256 rand = uint256(
            keccak256(
                abi.encodePacked(_name, block.timestamp, block.prevrandao)
            )
        );
        return rand % DNA_MODULUS;
    }

    /**
     * @dev Calculate rarity based on DNA
     */
    function calculateRarity(uint256 _dna) external pure returns (uint8) {
        uint256 rarityScore = _dna % 100;
        if (rarityScore < 50) return 1; // Common
        if (rarityScore < 75) return 2; // Uncommon
        if (rarityScore < 90) return 3; // Rare
        if (rarityScore < 98) return 4; // Epic
        return 5; // Legendary
    }

    /**
     * @dev Generate random number with modulo
     */
    function randMod(uint256 _modulus) external returns (uint256) {
        randNonce++;
        return
            uint256(
                keccak256(
                    abi.encodePacked(block.timestamp, msg.sender, randNonce)
                )
            ) % _modulus;
    }

    /**
     * @dev Mix DNA from two zombies
     */
    function mixDna(
        uint256 _dna1,
        uint256 _dna2
    ) external view returns (uint256) {
        uint256 rand = uint256(
            keccak256(abi.encodePacked(block.timestamp, _dna1, _dna2))
        );
        return rand % DNA_MODULUS;
    }
}
