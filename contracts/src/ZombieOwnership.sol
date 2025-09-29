// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ZombieAttack.sol";

/**
 * @title ZombieOwnership
 * @dev Contract for ERC721 NFT functionality and metadata
 * @author Your Name
 */
contract ZombieOwnership is ZombieAttack, ERC721, ReentrancyGuard {
    // Events
    event ZombieTransferred(uint256 zombieId, address from, address to);

    constructor() ERC721("CryptoZombies", "ZOMBIE") {}

    /**
     * @dev Override _update to handle zombie ownership tracking
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // If minting
        if (from == address(0)) {
            // Minting is handled in the base contracts
            return super._update(to, tokenId, auth);
        }

        // If transferring
        if (to != address(0)) {
            ownerZombieCount[from]--;
            ownerZombieCount[to]++;
            emit ZombieTransferred(tokenId, from, to);
        }

        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Override tokenURI to return metadata
     * @param tokenId The token ID
     * @return Token URI
     */
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        return
            string(
                abi.encodePacked(
                    "https://api.cryptozombies.io/metadata/",
                    _toString(tokenId)
                )
            );
    }

    /**
     * @dev Get zombie metadata as JSON
     * @param tokenId The token ID
     * @return JSON metadata string
     */
    function getZombieMetadata(
        uint256 tokenId
    ) public view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        return
            string(
                abi.encodePacked('{"name":"Zombie #', _toString(tokenId), '"}')
            );
    }

    /**
     * @dev Convert uint256 to string
     * @param value The value to convert
     * @return String representation
     */
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

    /**
     * @dev Override _createZombie to mint NFT
     */
    function _createZombie(
        string memory _name,
        uint256 _dna,
        uint8 _rarity
    ) internal override returns (uint256) {
        uint256 newZombieId = super._createZombie(_name, _dna, _rarity);
        _safeMint(msg.sender, newZombieId);
        ownerZombieCount[msg.sender]++;
        return newZombieId;
    }

    /**
     * @dev Get all zombie IDs owned by an address
     * @param owner The owner address
     * @return Array of token IDs
     */
    function getZombiesByOwner(
        address owner
    ) public view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](balanceOf(owner));
        uint256 counter = 0;

        for (uint256 i = 1; i <= getTotalZombiesCount(); i++) {
            if (_ownerOf(i) == owner) {
                result[counter] = i;
                counter++;
            }
        }

        return result;
    }
}
