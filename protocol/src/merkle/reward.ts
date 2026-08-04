import { currentSchemaVersion } from '../domain/schemaVersions';
import { concatBytes, type Hex, normalizeAccount, toBytes, uintToBytes, utf8ToBytes } from '../encoding/bytes';
import { DOMAIN_TAGS } from '../encoding/domain';
import { keccak256Hex } from '../encoding/hash';

/**
 * Merkle leaves for season reward entitlements (§I).
 *
 * A receipt leaf proves a battle happened. A reward leaf says a wallet may withdraw a
 * specific amount of a specific asset — a much stronger claim, so it gets its own domain
 * tag rather than extending the receipt one. Without that separation a receipt hash could
 * be presented where a reward leaf is expected, or the reverse.
 *
 * §I requires a claim to bind: the chain and the contract that will honour it, the season,
 * the beneficiary wallet, the asset, and the amount. All of that is in the leaf, which is
 * what makes a proof non-transferable across deployments: the same entitlement computed for
 * staging hashes differently from production, so a staging proof simply is not in the
 * production tree.
 *
 * Layout mirrors `merkleLeaf`'s constraint — fixed-width fields only, no length prefixes —
 * because a Solidity verifier has to reproduce these bytes with `abi.encodePacked` and
 * framing them would mean reimplementing the canonical writer on chain.
 *
 * The nullifier is deliberately *not* in the leaf. It is derived from the same fields by
 * the contract, so a claimant cannot choose it.
 */

/** `keccak256("CRYPTOPETS_MERKLE_REWARD_LEAF_V1")`. */
export const MERKLE_REWARD_LEAF_DOMAIN: Hex = keccak256Hex(utf8ToBytes(DOMAIN_TAGS.MERKLE_REWARD_LEAF));

export interface RewardEntitlement {
    /** EVM chain id of the distributor that will honour this claim. */
    chainId: number;
    /** The distributor contract address. Binds the proof to one deployment. */
    distributor: string;
    /** Which season this entitlement belongs to. */
    seasonId: number;
    /** Wallet permitted to claim it. */
    wallet: string;
    /** ERC-20 token address the reward is paid in. */
    token: string;
    /** Amount, in the token's own smallest unit. */
    amount: bigint;
}

const MAX_UINT256 = 1n << 256n;

/**
 * `keccak256(REWARD_LEAF_DOMAIN || schemaVersion || chainId || distributor || seasonId ||
 * wallet || token || amount)`.
 *
 * Addresses are lowercased before hashing, matching how every other account in this
 * protocol is normalized, so a checksummed and a lowercase spelling of one wallet produce
 * the same leaf rather than two entitlements for the same person.
 */
export function rewardMerkleLeaf(entitlement: RewardEntitlement): Hex {
    assertUint(entitlement.chainId, 'chainId');
    assertUint(entitlement.seasonId, 'seasonId');
    if (typeof entitlement.amount !== 'bigint' || entitlement.amount < 0n || entitlement.amount >= MAX_UINT256) {
        throw new Error(`amount must fit in a uint256, got ${entitlement.amount}`);
    }

    return keccak256Hex(
        concatBytes([
            toBytes(MERKLE_REWARD_LEAF_DOMAIN),
            uintToBytes(currentSchemaVersion('merkleRewardLeaf'), 2),
            uintToBytes(entitlement.chainId, 32),
            addressBytes(entitlement.distributor, 'distributor'),
            uintToBytes(entitlement.seasonId, 32),
            addressBytes(entitlement.wallet, 'wallet'),
            addressBytes(entitlement.token, 'token'),
            uintToBytes(entitlement.amount, 32),
        ]),
    );
}

function addressBytes(value: string, field: string): Uint8Array {
    const bytes = toBytes(normalizeAccount(value));
    if (bytes.length !== 20) {
        throw new Error(`${field} must be a 20-byte EVM address, got ${bytes.length} bytes`);
    }
    return bytes;
}

function assertUint(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative integer, got ${value}`);
    }
}
