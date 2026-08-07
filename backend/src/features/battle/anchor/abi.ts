/**
 * Minimal BattleBatchRegistry ABI — only what anchoring needs.
 *
 * Hand-written rather than imported from the Hardhat artifacts, matching how the settle
 * keeper declares GameLogic: the backend does not build the contracts, and depending on a
 * compiled artifact path would couple deploys of one to builds of the other.
 */
export const BATTLE_BATCH_REGISTRY_ABI = [
    {
        type: 'function',
        name: 'publishBatch',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'batchNumber', type: 'uint64' },
            { name: 'previousRoot', type: 'bytes32' },
            { name: 'merkleRoot', type: 'bytes32' },
            { name: 'rulesetSetHash', type: 'bytes32' },
            { name: 'firstSequence', type: 'uint64' },
            { name: 'lastSequence', type: 'uint64' },
        ],
        outputs: [],
    },
    {
        type: 'function',
        name: 'latestBatchNumber',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint64' }],
    },
    {
        type: 'function',
        name: 'latestRoot',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'bytes32' }],
    },
    {
        type: 'event',
        name: 'BatchPublished',
        inputs: [
            { indexed: true, name: 'batchNumber', type: 'uint64' },
            { indexed: true, name: 'merkleRoot', type: 'bytes32' },
            { indexed: false, name: 'previousRoot', type: 'bytes32' },
            { indexed: false, name: 'rulesetSetHash', type: 'bytes32' },
            { indexed: false, name: 'firstSequence', type: 'uint64' },
            { indexed: false, name: 'lastSequence', type: 'uint64' },
        ],
    },
] as const;

/**
 * Gas ceiling for one `publishBatch`. The call writes a fixed-size struct and two slots
 * regardless of how many receipts the batch covers, so this does not scale with batch size.
 */
export const PUBLISH_BATCH_GAS_LIMIT = 200_000n;

/** The registry's `previousRoot` for the very first batch. */
export const ZERO_ROOT = `0x${'00'.repeat(32)}` as const;
