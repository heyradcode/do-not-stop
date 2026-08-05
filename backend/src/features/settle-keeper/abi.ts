/**
 * Minimal hand-written ABI fragments for the settle keeper — only the events
 * and functions it actually calls, not the full generated GameLogic/Entropy
 * artifacts. Keeping this hand-rolled avoids giving `backend` a build
 * dependency on `contracts/ethereum`'s compiled artifacts.
 *
 * Battle entries are gone (§L Phase 6): the keeper now settles breed and mint
 * only, the two flows that still resolve on chain.
 */

export const GAME_LOGIC_ABI = [
    {
        type: 'event',
        name: 'BreedRandomnessRequested',
        inputs: [
            { indexed: true, name: 'owner', type: 'address' },
            { indexed: true, name: 'requestId', type: 'uint256' },
            { indexed: false, name: 'petId1', type: 'uint256' },
            { indexed: false, name: 'petId2', type: 'uint256' },
        ],
    },
    {
        type: 'event',
        name: 'MintRequested',
        inputs: [
            { indexed: true, name: 'owner', type: 'address' },
            { indexed: true, name: 'requestId', type: 'uint256' },
        ],
    },
    {
        type: 'event',
        name: 'BreedSettled',
        inputs: [
            { indexed: true, name: 'owner', type: 'address' },
            { indexed: true, name: 'childId', type: 'uint256' },
            { indexed: true, name: 'requestId', type: 'uint256' },
            { indexed: false, name: 'studFeePaidTo', type: 'address' },
        ],
    },
    {
        type: 'event',
        name: 'MintSettled',
        inputs: [
            { indexed: true, name: 'owner', type: 'address' },
            { indexed: true, name: 'petId', type: 'uint256' },
            { indexed: true, name: 'requestId', type: 'uint256' },
        ],
    },
    {
        type: 'function',
        name: 'settleBreed',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'requestId', type: 'uint256' }],
        outputs: [],
    },
    {
        type: 'function',
        name: 'settleMint',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'requestId', type: 'uint256' }],
        outputs: [],
    },
    {
        type: 'function',
        name: 'entropy',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address' }],
    },
] as const;

/**
 * Pyth Entropy's `Revealed` event (exact shape copied from
 * shared/src/hooks/chains/ethereum/useWatchEntropyFulfillment.ts, the
 * frontend's existing watcher for the same event) plus the two read/write
 * functions the local-dev mock-reveal path needs.
 */
export const ENTROPY_ABI = [
    {
        type: 'event',
        name: 'Revealed',
        anonymous: false,
        inputs: [
            { indexed: true, internalType: 'address', name: 'provider', type: 'address' },
            { indexed: true, internalType: 'address', name: 'caller', type: 'address' },
            { indexed: true, internalType: 'uint64', name: 'sequenceNumber', type: 'uint64' },
            { indexed: false, internalType: 'bytes32', name: 'randomNumber', type: 'bytes32' },
            { indexed: false, internalType: 'bytes32', name: 'userContribution', type: 'bytes32' },
            { indexed: false, internalType: 'bytes32', name: 'providerContribution', type: 'bytes32' },
            { indexed: false, internalType: 'bool', name: 'callbackFailed', type: 'bool' },
            { indexed: false, internalType: 'bytes', name: 'callbackReturnValue', type: 'bytes' },
            { indexed: false, internalType: 'uint32', name: 'callbackGasUsed', type: 'uint32' },
            { indexed: false, internalType: 'bytes', name: 'extraArgs', type: 'bytes' },
        ],
    },
    {
        type: 'function',
        name: 'getDefaultProvider',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address' }],
    },
    {
        // Local-dev only (MockEntropy.sol): reveals a pending request the way the real
        // Pyth provider would. Never callable against the real Entropy contract on a
        // live network — this ABI entry simply won't match anything there.
        type: 'function',
        name: 'mockReveal',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'provider', type: 'address' },
            { name: 'sequenceNumber', type: 'uint64' },
            { name: 'randomNumber', type: 'bytes32' },
        ],
        outputs: [],
    },
] as const;

export type SettleFunctionName = 'settleBreed' | 'settleMint';

/** Gas limits for settle calls — RPC gas estimation fails on these (mirrors the
 *  identical comment/values in shared/src/hooks/chains/ethereum/gasLimits.ts). */
export const SETTLE_GAS_LIMIT: Record<SettleFunctionName, bigint> = {
    settleBreed: 800_000n,
    settleMint: 500_000n,
};
