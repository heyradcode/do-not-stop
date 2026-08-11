/**
 * Schema versions for every signed or hashed protocol object.
 *
 * Each object carries its own version inside the bytes that get hashed, so a
 * digest states which field list produced it. Two rules make that useful:
 *
 * - **Bump on any encoding change.** Adding, removing, reordering, or retyping a
 *   field changes what a digest means. Reusing the version would leave two
 *   incompatible layouts claiming to be the same thing, and no verifier could
 *   tell which one a historical receipt used.
 * - **An unknown version is a hard error.** Never parse an object at a version
 *   this build does not implement, and never fall back to the nearest known
 *   layout. Refusing is recoverable (upgrade the verifier); a best-effort read
 *   produces a confident wrong answer.
 *
 * Old versions stay listed here as they accumulate, because historical receipts
 * must keep verifying.
 */
export const SCHEMA_VERSIONS = {
    intent: 1,
    defenseAuthorization: 1,
    /** Delegated battle-intent signing (§D). Not carried by any receipt. */
    sessionDelegation: 1,
    /** 2 adds per-pet equipment (roadmap §4). Version 1 snapshots carry none. */
    snapshot: 2,
    /** 2 adds the combat-affecting item catalog (roadmap §4). */
    ruleset: 2,
    commitment: 1,
    receipt: 1,
    combatLog: 1,
    merkleLeaf: 1,
    /**
     * The narrow (20-byte account) reward leaf, which EVM uses.
     *
     * Stays 1 rather than tracking the highest number, unlike every other entry here. 2 is
     * the wide (32-byte account) layout Solana uses, and the two are chosen by account
     * width rather than by age: both are current and neither will be retired. See
     * `WIDE_REWARD_LEAF_SCHEMA_VERSION`.
     */
    merkleRewardLeaf: 1,
} as const;

/** Kinds of object this protocol versions. */
export type SchemaKind = keyof typeof SCHEMA_VERSIONS;

/** Versions this build can produce and verify, per kind. */
const SUPPORTED_VERSIONS: Record<SchemaKind, readonly number[]> = {
    intent: [1],
    defenseAuthorization: [1],
    sessionDelegation: [1],
    // 1 stays supported: every receipt signed before equipment existed names a v1
    // snapshot, and those have to keep verifying forever (§H).
    snapshot: [1, 2],
    // 1 stays supported for the same reason: bundles published before equipment
    // existed are named by receipts that must keep verifying.
    ruleset: [1, 2],
    commitment: [1],
    receipt: [1],
    combatLog: [1],
    merkleLeaf: [1],
    // Both permanently: 1 is the 20-byte-account layout the deployed EVM distributor
    // verifies, 2 the 32-byte-account one Solana needs. Neither supersedes the other.
    merkleRewardLeaf: [1, 2],
};

/** The version this build writes for `kind`. */
export function currentSchemaVersion(kind: SchemaKind): number {
    return SCHEMA_VERSIONS[kind];
}

/**
 * Throws unless this build implements `version` of `kind`. Call before reading an
 * object that came from outside this process, including our own older receipts.
 */
export function assertSupportedSchemaVersion(kind: SchemaKind, version: number): void {
    const supported = SUPPORTED_VERSIONS[kind];
    if (!supported) {
        throw new Error(`unknown protocol object kind: ${kind}`);
    }
    if (!Number.isSafeInteger(version) || version < 1) {
        throw new Error(`${kind} schema version must be a positive integer, got ${version}`);
    }
    if (!supported.includes(version)) {
        throw new Error(
            `unsupported ${kind} schema version ${version}; this build implements ${supported.join(', ')}`,
        );
    }
}
