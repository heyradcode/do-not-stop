/**
 * Minimal `SeasonRewardDistributor` ABI — only what claiming needs.
 *
 * Hand-written rather than imported from the Hardhat artifacts, matching how the backend
 * declares the batch registry: the client does not build the contracts, and depending on a
 * compiled artifact path would couple deploys of one to builds of the other.
 *
 * `wallet` is an argument rather than `msg.sender` on purpose. The leaf binds the
 * beneficiary, so anyone may pay the gas to deliver someone else's reward and nobody can
 * redirect it — the same property the Solana side gets from constraining the destination
 * token account.
 */
export const SEASON_REWARD_DISTRIBUTOR_ABI = [
    {
        type: 'function',
        name: 'claim',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'seasonId', type: 'uint32' },
            { name: 'wallet', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'proof', type: 'bytes32[]' },
        ],
        outputs: [],
    },
    {
        type: 'function',
        name: 'hasClaimed',
        stateMutability: 'view',
        inputs: [
            { name: 'seasonId', type: 'uint32' },
            { name: 'wallet', type: 'address' },
        ],
        outputs: [{ type: 'bool' }],
    },
] as const;
