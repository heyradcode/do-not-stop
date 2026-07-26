// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BattleBatchRegistry
 * @notice Immutable publication record for batches of backend-resolved battle receipts.
 * @dev docs/plan-backend-battle-architecture.md §I. Deliberately minimal: this contract
 *      stores roots and nothing else. It does not verify proofs, hold funds, or know what
 *      a reward is — the claim path is a separate contract, so the thing every player's
 *      history is anchored against stays small enough to audit in one sitting.
 *
 *      **What anchoring does and does not prove.** Publishing a root here makes the batch
 *      immutable and ordered: once written, we cannot change what a batch contained or
 *      insert one after the fact. It does *not* prove the receipts inside were computed
 *      honestly — that is public replay's job (§H) — and it does not force us to include
 *      any particular receipt. A signed receipt that never appears in a batch is evidence
 *      of operator failure, not a claim this contract can settle.
 *
 *      Not behind a proxy, on purpose. An upgradeable registry would defeat the point: the
 *      operator could rewrite history by upgrading the thing that records it. Migrating
 *      means deploying a new registry and starting a new chain of batches, which is
 *      visible to everyone rather than silent.
 */
contract BattleBatchRegistry is Ownable, Pausable {
    /// @notice One published batch. Mirrors §I's commitment field list exactly.
    struct Batch {
        bytes32 previousRoot;
        bytes32 merkleRoot;
        /// @dev Hash over the set of ruleset hashes the batched receipts used, so a batch
        ///      names the rules its contents were fought under.
        bytes32 rulesetSetHash;
        uint64 firstSequence;
        uint64 lastSequence;
        /// @dev Block timestamp at publication. The operator's own `createdAt` travels in
        ///      the receipts; this is when the chain saw it, which is the one nobody can
        ///      backdate.
        uint64 publishedAt;
    }

    /// @notice Wallets permitted to publish. Held by a multisig/timelock in production.
    mapping(address => bool) public isPublisher;

    /// @notice batchNumber => published batch. Batch numbers start at 1.
    mapping(uint64 => Batch) private _batches;

    /// @notice Highest batch number published so far. 0 before the first batch.
    uint64 public latestBatchNumber;

    /// @notice Merkle root of the most recent batch, which the next batch must name.
    bytes32 public latestRoot;

    event PublisherSet(address indexed publisher, bool allowed);
    event BatchPublished(
        uint64 indexed batchNumber,
        bytes32 indexed merkleRoot,
        bytes32 previousRoot,
        bytes32 rulesetSetHash,
        uint64 firstSequence,
        uint64 lastSequence
    );

    error NotPublisher();
    error WrongBatchNumber(uint64 expected, uint64 given);
    error WrongPreviousRoot(bytes32 expected, bytes32 given);
    error EmptyRoot();
    error BadSequenceRange();
    error SequenceNotContiguous(uint64 expectedFirst, uint64 given);

    modifier onlyPublisher() {
        if (!isPublisher[msg.sender]) revert NotPublisher();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Grants or revokes publishing rights.
    /// @dev Owner-only, and the owner is expected to be a multisig behind a timelock (§I).
    ///      Rotating a compromised publisher must not require touching anything else.
    function setPublisher(address publisher, bool allowed) external onlyOwner {
        isPublisher[publisher] = allowed;
        emit PublisherSet(publisher, allowed);
    }

    /// @notice Emergency stop. Publication resumes exactly where it left off.
    /// @dev Pausing does not invalidate anything already published; it only stops new
    ///      batches, which is the correct response to a suspected signer compromise.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Publishes the next batch.
     * @dev Every argument is checked against on-chain state rather than trusted, because
     *      the ordering guarantee is the only thing this contract actually provides:
     *
     *      - `batchNumber` must be exactly the next one, so a batch cannot be skipped or
     *        republished.
     *      - `previousRoot` must be the current head, so the chain of batches is
     *        append-only and a fork is impossible rather than merely detectable.
     *      - `firstSequence` must continue from the previous batch's `lastSequence`, so a
     *        run of receipts cannot be silently dropped between batches. This is the check
     *        that turns "we published some receipts" into "we published all of them, in
     *        order, or the transaction reverted".
     *
     *      A gap is still possible *within* the operator's own numbering — nothing here can
     *      force a receipt to be assigned a sequence at all. That gap is what the inclusion
     *      SLO and its alert exist for, and it is deliberately visible rather than papered
     *      over here.
     */
    function publishBatch(
        uint64 batchNumber,
        bytes32 previousRoot,
        bytes32 merkleRoot,
        bytes32 rulesetSetHash,
        uint64 firstSequence,
        uint64 lastSequence
    ) external onlyPublisher whenNotPaused {
        uint64 expectedNumber = latestBatchNumber + 1;
        if (batchNumber != expectedNumber) revert WrongBatchNumber(expectedNumber, batchNumber);
        if (previousRoot != latestRoot) revert WrongPreviousRoot(latestRoot, previousRoot);
        if (merkleRoot == bytes32(0)) revert EmptyRoot();
        if (lastSequence < firstSequence) revert BadSequenceRange();

        if (latestBatchNumber != 0) {
            uint64 expectedFirst = _batches[latestBatchNumber].lastSequence + 1;
            if (firstSequence != expectedFirst) revert SequenceNotContiguous(expectedFirst, firstSequence);
        }

        _batches[batchNumber] = Batch({
            previousRoot: previousRoot,
            merkleRoot: merkleRoot,
            rulesetSetHash: rulesetSetHash,
            firstSequence: firstSequence,
            lastSequence: lastSequence,
            publishedAt: uint64(block.timestamp)
        });
        latestBatchNumber = batchNumber;
        latestRoot = merkleRoot;

        emit BatchPublished(
            batchNumber,
            merkleRoot,
            previousRoot,
            rulesetSetHash,
            firstSequence,
            lastSequence
        );
    }

    /// @notice Reads one published batch. Zeroed struct for a batch number never published.
    function getBatch(uint64 batchNumber) external view returns (Batch memory) {
        return _batches[batchNumber];
    }

    /// @notice Whether a root was ever published, for a claim contract to check cheaply.
    /// @dev Returns false for the zero root, which `publishBatch` refuses, so an
    ///      uninitialised lookup can never read as an accepted root.
    function isPublishedRoot(uint64 batchNumber, bytes32 merkleRoot) external view returns (bool) {
        return merkleRoot != bytes32(0) && _batches[batchNumber].merkleRoot == merkleRoot;
    }
}
