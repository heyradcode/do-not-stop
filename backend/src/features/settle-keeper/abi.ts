/**
 * Minimal hand-written ABI fragments for the settle keeper — only the events
 * and functions it actually calls, not the full generated GameLogic/Entropy
 * artifacts (mirrors the existing pattern in
 * contracts/ethereum/scripts/resolve-stuck-battle.ts). Keeping this
 * hand-rolled avoids giving `backend` a build dependency on
 * `contracts/ethereum`'s compiled artifacts.
 */

export const GAME_LOGIC_ABI = [
    {
        type: 'event',
        name: 'BattleRandomnessRequested',
        inputs: [
            { indexed: true, name: 'requester', type: 'address' },
            { indexed: true, name: 'requestId', type: 'uint256' },
            { indexed: false, name: 'petId1', type: 'uint256' },
            { indexed: false, name: 'petId2', type: 'uint256' },
        ],
    },
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
        name: 'BattleResolved',
        inputs: [
            { indexed: true, name: 'requestId', type: 'uint256' },
            { indexed: true, name: 'winnerId', type: 'uint256' },
            { indexed: true, name: 'loserId', type: 'uint256' },
            { indexed: false, name: 'randomness', type: 'uint256' },
            { indexed: false, name: 'firstWins', type: 'bool' },
            { indexed: false, name: 'rounds', type: 'uint8' },
            { indexed: false, name: 'winnerHpRemaining', type: 'uint16' },
            { indexed: false, name: 'xpWin', type: 'uint32' },
            { indexed: false, name: 'xpLoss', type: 'uint32' },
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
        name: 'settleBattle',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'requestId', type: 'uint256' }],
        outputs: [],
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
    {
        // Frozen sim-input snapshot (plan-realtime-battle-impl.md Phase 1), read once
        // entropy reveals so the live-battle-socket feature can run the identical sim
        // CombatSim.settleBattle will use. Only the fields the sim needs are declared.
        type: 'function',
        name: 'getBattleRequest',
        stateMutability: 'view',
        inputs: [{ name: 'requestId', type: 'uint256' }],
        outputs: [
            {
                type: 'tuple',
                components: [
                    { name: 'requester', type: 'address' },
                    { name: 'petId1', type: 'uint256' },
                    { name: 'petId2', type: 'uint256' },
                    { name: 'randomness', type: 'uint256' },
                    { name: 'fulfilled', type: 'bool' },
                    { name: 'snapshotted', type: 'bool' },
                    { name: 'dna1', type: 'uint256' },
                    { name: 'dna2', type: 'uint256' },
                    { name: 'level1', type: 'uint32' },
                    { name: 'level2', type: 'uint32' },
                    { name: 'rarity1', type: 'uint8' },
                    { name: 'rarity2', type: 'uint8' },
                    { name: 'speciesId1', type: 'uint16' },
                    { name: 'speciesId2', type: 'uint16' },
                ],
            },
        ],
    },
] as const;

/** Minimal GameConfig ABI — only `getSkillConfig`, read once per battle reveal to feed the
 *  live-battle-socket sim (plan-realtime-battle-impl.md Phase 4's skill-balance values). */
export const GAME_CONFIG_ABI = [
    {
        type: 'function',
        name: 'getSkillConfig',
        stateMutability: 'view',
        inputs: [],
        outputs: [
            {
                type: 'tuple',
                components: [
                    { name: 'tankHpMult', type: 'uint16' },
                    { name: 'shellDefMult', type: 'uint16' },
                    { name: 'swiftCritBonus', type: 'uint16' },
                    { name: 'cunningCritCap', type: 'uint16' },
                    { name: 'furyDmgMult', type: 'uint16' },
                    { name: 'furyHpThreshold', type: 'uint16' },
                    { name: 'sageMdefMult', type: 'uint16' },
                    { name: 'bloodlustBps', type: 'uint16' },
                ],
            },
        ],
    },
] as const;

/** The three request-type events GameLogic emits at requestX time. */
export const REQUEST_EVENT_NAMES = [
    'BattleRandomnessRequested',
    'BreedRandomnessRequested',
    'MintRequested',
] as const;

/** The three settlement events GameLogic emits once a request is settled. */
export const SETTLED_EVENT_NAMES = ['BattleResolved', 'BreedSettled', 'MintSettled'] as const;

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

export type SettleFunctionName = 'settleBattle' | 'settleBreed' | 'settleMint';

/** Gas limits for settle calls — RPC gas estimation fails on these (mirrors the
 *  identical comment/values in shared/src/hooks/chains/ethereum/gasLimits.ts). */
export const SETTLE_GAS_LIMIT: Record<SettleFunctionName, bigint> = {
    settleBattle: 800_000n,
    settleBreed: 800_000n,
    settleMint: 500_000n,
};
