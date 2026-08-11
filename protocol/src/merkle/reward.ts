import { currentSchemaVersion } from '../domain/schemaVersions';
import { base58ToBytes } from '../encoding/base58';
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

// ─── Version 2: the wide-account layout ───────────────────────────────────────

/**
 * Schema version for the 32-byte-account layout.
 *
 * **Not a successor to version 1.** Both are current and neither will be retired: the two
 * differ by how wide an account is on the chain honouring the claim, not by age. EVM stays
 * on 1 permanently, because `SeasonRewardDistributor.sol` hardcodes
 * `REWARD_LEAF_SCHEMA_VERSION = 1` alongside a 20-byte `abi.encodePacked` layout, so moving
 * it would mean redeploying the distributor and invalidating every outstanding proof.
 *
 * That makes this different from the `snapshot` and `ruleset` bumps, where 2 genuinely
 * replaced 1. `SCHEMA_VERSIONS.merkleRewardLeaf` therefore stays 1 rather than tracking the
 * highest number, and both appear in `SUPPORTED_VERSIONS`.
 */
export const WIDE_REWARD_LEAF_SCHEMA_VERSION = 2;

export interface WideRewardEntitlement {
    /**
     * 32-byte identity of the chain that will honour this claim, base58 or 0x-hex.
     *
     * Solana's analogue of `block.chainid` is the cluster's **genesis hash**, which is what
     * belongs here. No program can read it at runtime, so the distributor stores it on the
     * season account rather than taking it from a claimant, which preserves the property
     * that matters: the chain identity in the leaf is never caller-supplied.
     */
    chainRef: string;
    /** The distributor program's id. Binds the proof to one deployment. */
    distributor: string;
    seasonId: number;
    /** Wallet permitted to claim it. */
    wallet: string;
    /** SPL mint the reward is paid in. */
    token: string;
    /** Amount, in the token's own smallest unit. */
    amount: bigint;
}

/**
 * `keccak256(REWARD_LEAF_DOMAIN || schemaVersion || chainRef || distributor || seasonId ||
 * wallet || token || amount)`, with every account 32 bytes wide.
 *
 * Same domain tag as version 1, because this is the same kind of claim about the same kind
 * of thing; the version field inside the bytes is what keeps the two layouts apart. They
 * also differ in length, so a version-1 leaf cannot be reinterpreted as a version-2 one even
 * before the version byte is read.
 *
 * Fixed-width fields only, no length prefixes, matching version 1's constraint for the same
 * reason: an on-chain verifier has to reproduce these bytes without a canonical writer, and
 * on Solana that means `keccak::hashv` over a handful of slices.
 */
export function wideRewardMerkleLeaf(entitlement: WideRewardEntitlement): Hex {
    assertUint(entitlement.seasonId, 'seasonId');
    if (typeof entitlement.amount !== 'bigint' || entitlement.amount < 0n || entitlement.amount >= MAX_UINT256) {
        throw new Error(`amount must fit in a uint256, got ${entitlement.amount}`);
    }

    return keccak256Hex(
        concatBytes([
            toBytes(MERKLE_REWARD_LEAF_DOMAIN),
            uintToBytes(WIDE_REWARD_LEAF_SCHEMA_VERSION, 2),
            wideBytes(entitlement.chainRef, 'chainRef'),
            wideBytes(entitlement.distributor, 'distributor'),
            uintToBytes(entitlement.seasonId, 32),
            wideBytes(entitlement.wallet, 'wallet'),
            wideBytes(entitlement.token, 'token'),
            uintToBytes(entitlement.amount, 32),
        ]),
    );
}

/**
 * Exactly 32 bytes, from base58 or `0x`-hex.
 *
 * The two are told apart by the first character: base58's alphabet omits `0`, so nothing
 * valid in it can start with `0x`. Both are accepted because a Solana pubkey is written
 * base58 everywhere a human sees it, while a genesis hash may arrive either way.
 *
 * A 20-byte EVM address is **rejected** rather than left-padded. Padding would let the same
 * account produce a leaf under both layouts, and silently accepting a short value is how a
 * truncated key becomes an entitlement payable to nobody.
 */
function wideBytes(value: string, field: string): Uint8Array {
    if (value.length === 0) {
        throw new Error(`${field} is empty`);
    }
    const bytes = value.startsWith('0x') ? toBytes(value) : base58ToBytes(value);
    if (bytes.length !== 32) {
        throw new Error(`${field} must be 32 bytes, got ${bytes.length}`);
    }
    return bytes;
}

// ─── Choosing a layout ────────────────────────────────────────────────────────

/** A reward entitlement tagged with the account width its chain uses. */
export type FamilyRewardEntitlement =
    | ({ family: 'evm' } & RewardEntitlement)
    | ({ family: 'solana' } & WideRewardEntitlement);

/**
 * The leaf for an entitlement, choosing the layout by chain family.
 *
 * By family, never by build: a build that picked the newest layout it implements would
 * re-encode every EVM entitlement under a layout the deployed distributor cannot verify.
 * Callers get the family from `chainFamily(chainId)`.
 */
export function rewardMerkleLeafFor(entitlement: FamilyRewardEntitlement): Hex {
    return entitlement.family === 'solana'
        ? wideRewardMerkleLeaf(entitlement)
        : rewardMerkleLeaf(entitlement);
}
