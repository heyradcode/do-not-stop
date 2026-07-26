// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SeasonRewardDistributor
 * @notice Capped, one-time reward claims against a per-season Merkle root.
 * @dev docs/plan-backend-battle-architecture.md §I. Separate from BattleBatchRegistry on
 *      purpose: that contract is the immutable record of what happened and must stay
 *      minimal, while this one holds funds. Keeping the ledger away from the money means a
 *      bug here cannot corrupt the history, and a pause here cannot stop battles.
 *
 *      **What a claim proves.** Membership in a season's reward tree, and nothing more.
 *      The tree is computed off chain from anchored receipts, so the per-battle reward cap
 *      §I asks for is applied there, where the battles are actually visible. What this
 *      contract enforces is the part that must not depend on the operator being honest:
 *      one claim per wallet per season, a per-wallet ceiling, and a season total that
 *      cannot be exceeded no matter what root was posted.
 *
 *      That division matters. A root is operator-supplied, so treating it as authoritative
 *      for *value* would make a bad root an unbounded loss. The caps here bound the damage
 *      to something the owner chose in advance, which is what makes posting a root a
 *      recoverable mistake rather than a fatal one.
 *
 *      Not upgradeable, and holds only what has been deposited for the seasons it knows
 *      about.
 */
contract SeasonRewardDistributor is Ownable, Pausable {
    using SafeERC20 for IERC20;

    /// @dev `keccak256("CRYPTOPETS_MERKLE_REWARD_LEAF_V1")` — must equal the protocol's
    ///      `MERKLE_REWARD_LEAF_DOMAIN`, or no proof this contract checks will ever match a
    ///      tree the backend builds.
    bytes32 public constant REWARD_LEAF_DOMAIN = keccak256("CRYPTOPETS_MERKLE_REWARD_LEAF_V1");
    /// @dev `keccak256("CRYPTOPETS_MERKLE_NODE_V1")` — the protocol's internal-node tag.
    bytes32 public constant MERKLE_NODE_DOMAIN = keccak256("CRYPTOPETS_MERKLE_NODE_V1");
    /// @dev Schema version written into every reward leaf. Bumping it in the protocol
    ///      without bumping it here silently invalidates every proof.
    uint16 public constant REWARD_LEAF_SCHEMA_VERSION = 1;

    struct Season {
        bytes32 merkleRoot;
        IERC20 token;
        /// @dev Most any single wallet may claim. Bounds one bad leaf.
        uint256 perWalletCap;
        /// @dev Most the whole season may pay out. Bounds one bad root.
        uint256 seasonCap;
        uint256 totalClaimed;
        uint64 claimsOpenAt;
        uint64 claimsCloseAt;
    }

    mapping(uint32 => Season) private _seasons;
    /// @notice nullifier => claimed. `keccak256(seasonId, wallet)`, so one claim per wallet.
    mapping(bytes32 => bool) public claimed;

    event SeasonOpened(
        uint32 indexed seasonId,
        bytes32 indexed merkleRoot,
        address indexed token,
        uint256 perWalletCap,
        uint256 seasonCap,
        uint64 claimsOpenAt,
        uint64 claimsCloseAt
    );
    event RewardClaimed(uint32 indexed seasonId, address indexed wallet, uint256 amount, bytes32 nullifier);
    event UnclaimedSwept(uint32 indexed seasonId, address indexed to, uint256 amount);

    error SeasonAlreadyOpen();
    error SeasonUnknown();
    error EmptyRoot();
    error ClaimsNotOpen();
    error ClaimsClosed();
    error ClaimsStillOpen();
    error AlreadyClaimed();
    error BadProof();
    error ExceedsWalletCap(uint256 cap, uint256 amount);
    error ExceedsSeasonCap(uint256 remaining, uint256 amount);
    error BadClaimWindow();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Opens a season with its root and its caps.
     * @dev A season can be opened exactly once. Re-posting a root would let the operator
     *      rewrite entitlements after people had already read them, which is the single
     *      most valuable thing an attacker who compromised the owner key could do — so it
     *      is not possible even for the owner. A mistaken root is corrected by opening a
     *      new season, visibly, not by editing this one.
     *
     *      Caps are per season rather than global constants because the right numbers are a
     *      product decision that depends on real battle volume, and §L defers them to what
     *      the rewardless launch shows. The mechanism is fixed here; the numbers are not.
     */
    function openSeason(
        uint32 seasonId,
        bytes32 merkleRoot,
        IERC20 token,
        uint256 perWalletCap,
        uint256 seasonCap,
        uint64 claimsOpenAt,
        uint64 claimsCloseAt
    ) external onlyOwner {
        if (_seasons[seasonId].merkleRoot != bytes32(0)) revert SeasonAlreadyOpen();
        if (merkleRoot == bytes32(0)) revert EmptyRoot();
        if (claimsCloseAt <= claimsOpenAt) revert BadClaimWindow();

        _seasons[seasonId] = Season({
            merkleRoot: merkleRoot,
            token: token,
            perWalletCap: perWalletCap,
            seasonCap: seasonCap,
            totalClaimed: 0,
            claimsOpenAt: claimsOpenAt,
            claimsCloseAt: claimsCloseAt
        });

        emit SeasonOpened(seasonId, merkleRoot, address(token), perWalletCap, seasonCap, claimsOpenAt, claimsCloseAt);
    }

    /**
     * @notice Claims a season entitlement for `wallet`.
     * @dev Permissionless in who *sends* it but not in who is *paid*: the leaf binds the
     *      beneficiary, so anyone may pay the gas to deliver someone else's reward and
     *      nobody can redirect it. That makes sponsored claims possible without adding a
     *      way to steal one.
     *
     *      Effects before interactions, and the nullifier is set before the transfer, so a
     *      token with a callback cannot re-enter into a second claim.
     */
    function claim(
        uint32 seasonId,
        address wallet,
        uint256 amount,
        bytes32[] calldata proof
    ) external whenNotPaused {
        Season storage season = _seasons[seasonId];
        if (season.merkleRoot == bytes32(0)) revert SeasonUnknown();
        if (block.timestamp < season.claimsOpenAt) revert ClaimsNotOpen();
        if (block.timestamp >= season.claimsCloseAt) revert ClaimsClosed();

        bytes32 nullifier = claimNullifier(seasonId, wallet);
        if (claimed[nullifier]) revert AlreadyClaimed();

        if (amount > season.perWalletCap) revert ExceedsWalletCap(season.perWalletCap, amount);
        uint256 remaining = season.seasonCap - season.totalClaimed;
        if (amount > remaining) revert ExceedsSeasonCap(remaining, amount);

        bytes32 leaf = rewardLeaf(seasonId, wallet, address(season.token), amount);
        if (!_verifyProof(proof, season.merkleRoot, leaf)) revert BadProof();

        claimed[nullifier] = true;
        season.totalClaimed += amount;

        emit RewardClaimed(seasonId, wallet, amount, nullifier);
        season.token.safeTransfer(wallet, amount);
    }

    /**
     * @notice Recovers whatever a closed season never paid out.
     * @dev Only after the window shuts, so this cannot be used to pull the funds out from
     *      under people who are still entitled to them.
     */
    function sweepUnclaimed(uint32 seasonId, address to) external onlyOwner {
        Season storage season = _seasons[seasonId];
        if (season.merkleRoot == bytes32(0)) revert SeasonUnknown();
        if (block.timestamp < season.claimsCloseAt) revert ClaimsStillOpen();

        uint256 balance = season.token.balanceOf(address(this));
        emit UnclaimedSwept(seasonId, to, balance);
        season.token.safeTransfer(to, balance);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getSeason(uint32 seasonId) external view returns (Season memory) {
        return _seasons[seasonId];
    }

    /// @notice Whether this wallet has already claimed this season.
    function hasClaimed(uint32 seasonId, address wallet) external view returns (bool) {
        return claimed[claimNullifier(seasonId, wallet)];
    }

    /// @notice The one-time claim id for a wallet in a season.
    /// @dev Derived rather than supplied, so a claimant cannot choose their own nullifier
    ///      and mint themselves a second claim.
    function claimNullifier(uint32 seasonId, address wallet) public pure returns (bytes32) {
        return keccak256(abi.encode(seasonId, wallet));
    }

    /**
     * @notice The reward leaf, byte-identical to the protocol's `rewardMerkleLeaf`.
     * @dev `abi.encodePacked` over fixed-width fields only, which is why the protocol's
     *      layout avoids length prefixes: framing it would mean reimplementing the
     *      canonical writer on chain. `block.chainid` and `address(this)` come from the
     *      chain rather than the caller, so a proof built for another deployment cannot be
     *      replayed here — it simply hashes to a leaf that is not in this root.
     */
    function rewardLeaf(
        uint32 seasonId,
        address wallet,
        address token,
        uint256 amount
    ) public view returns (bytes32) {
        return rewardLeafFor(block.chainid, address(this), seasonId, wallet, token, amount);
    }

    /**
     * @notice The same leaf for an arbitrary chain and distributor.
     * @dev Pure, so off-chain tooling can cross-check a tree it built against this exact
     *      encoding, and so the encoding is testable against a fixed vector without
     *      depending on where a test happens to deploy this contract. The security property
     *      is unaffected: `claim` always goes through `rewardLeaf`, which supplies
     *      `block.chainid` and `address(this)` itself and never takes them from a caller.
     */
    function rewardLeafFor(
        uint256 chainId,
        address distributor,
        uint32 seasonId,
        address wallet,
        address token,
        uint256 amount
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                REWARD_LEAF_DOMAIN,
                REWARD_LEAF_SCHEMA_VERSION,
                chainId,
                distributor,
                uint256(seasonId),
                wallet,
                token,
                amount
            )
        );
    }

    /**
     * @dev Verifies a proof using the protocol's domain-separated node hash, not
     *      OpenZeppelin's. `MerkleProof.verify` hashes a sorted pair with no tag, which
     *      lets an internal node be presented as a leaf; the tag is what makes that
     *      structurally impossible.
     */
    function _verifyProof(bytes32[] calldata proof, bytes32 root, bytes32 leaf) private pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            computed = _hashNode(computed, proof[i]);
        }
        return computed == root;
    }

    /// @dev `keccak256(NODE_DOMAIN || min(a,b) || max(a,b))`, matching `merkleNode`.
    function _hashNode(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a <= b
            ? keccak256(abi.encodePacked(MERKLE_NODE_DOMAIN, a, b))
            : keccak256(abi.encodePacked(MERKLE_NODE_DOMAIN, b, a));
    }
}
