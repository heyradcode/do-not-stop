import { assertProtocolDomain, type ProtocolDomain } from '../domain/deployment';
import { type Hex, toBytes } from '../encoding/bytes';
import { DOMAIN_TAGS } from '../encoding/domain';
import { keccak256Hex } from '../encoding/hash';
import { CanonicalWriter } from '../encoding/writer';

/**
 * Everything the battle seed is derived from.
 *
 * All of these are fixed before the beacon value exists, and the beacon value
 * itself is pinned by the commitment naming its round in advance. So nobody,
 * including us, can steer the seed: we cannot choose the randomness (drand
 * publishes it) and we cannot choose which randomness applies (the signed
 * commitment already said which round).
 */
export interface SeedInputs {
    domain: ProtocolDomain;
    /** The 32-byte `randomness` of the committed drand round. */
    drandRandomness: Hex | Uint8Array;
    /** Ledger id of this battle. */
    battleId: string;
    snapshotHash: Hex;
    rulesetHash: Hex;
}

/** A derived seed, in both forms callers need. */
export interface BattleSeed {
    /** 0x-hex, as stored in the receipt. */
    hex: Hex;
    /** The same value as the uint256 `simulate()` takes. */
    value: bigint;
}

/** Length of a drand `randomness` value. */
export const DRAND_RANDOMNESS_LENGTH = 32;

const SAFE_BATTLE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * The exact bytes the seed is hashed over. Exported because a seed mismatch
 * between two implementations is otherwise a 32-byte shrug: comparing preimages
 * says which field diverged.
 *
 * Two notes on the layout, since it differs from the pseudocode in §E of the
 * architecture document.
 *
 * First, framing. §E writes the derivation as `keccak256(tag || chainId || ...)`,
 * which reads as bare concatenation. This goes through the canonical encoder
 * instead, so every element is length-prefixed. Bare concatenation of
 * variable-length fields is ambiguous: deployment `ab` with battle id `c` gives
 * the same bytes as `a` with `bc`, and a boundary an attacker can move is a seed
 * they can reach twice. The document's field *order* is preserved exactly.
 *
 * Second, versioning. There is no schema-version field here, unlike the other
 * hashed objects. `CRYPTOPETS_BATTLE_V1` is the version: a future derivation gets
 * a new tag, which leaves every historical seed derivable under the old one. §E
 * fixes this tag, so it must never change.
 */
export function encodeSeedInputs(inputs: SeedInputs): Uint8Array {
    const domain = assertProtocolDomain(inputs.domain);
    if (!SAFE_BATTLE_ID_PATTERN.test(inputs.battleId)) {
        throw new Error(`battleId is not a valid id: ${JSON.stringify(inputs.battleId)}`);
    }
    return CanonicalWriter.withDomain(DOMAIN_TAGS.SEED)
        .text(domain.chainId)
        .text(domain.deploymentId)
        .bytes(assertRandomness(inputs.drandRandomness))
        .text(inputs.battleId)
        .hash(inputs.snapshotHash)
        .hash(inputs.rulesetHash)
        .build();
}

/**
 * Derives the battle seed (§E).
 *
 * The domain, snapshot, and ruleset all feed in so one beacon round cannot produce
 * the same seed for two battles, two deployments, or two rulesets. drand publishes
 * one value per round to the entire world; this derivation is what makes our use
 * of it specific to one fight.
 */
export function deriveBattleSeed(inputs: SeedInputs): BattleSeed {
    const hex = keccak256Hex(encodeSeedInputs(inputs));
    return { hex, value: BigInt(hex) };
}

function assertRandomness(value: Hex | Uint8Array): Uint8Array {
    const bytes = toBytes(value);
    if (bytes.length !== DRAND_RANDOMNESS_LENGTH) {
        throw new Error(`drandRandomness must be ${DRAND_RANDOMNESS_LENGTH} bytes, got ${bytes.length}`);
    }
    return bytes;
}
