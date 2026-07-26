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
    snapshot: 1,
    ruleset: 1,
    commitment: 1,
    receipt: 1,
    combatLog: 1,
    merkleLeaf: 1,
} as const;

/** Kinds of object this protocol versions. */
export type SchemaKind = keyof typeof SCHEMA_VERSIONS;

/** Versions this build can produce and verify, per kind. */
const SUPPORTED_VERSIONS: Record<SchemaKind, readonly number[]> = {
    intent: [1],
    defenseAuthorization: [1],
    snapshot: [1],
    ruleset: [1],
    commitment: [1],
    receipt: [1],
    combatLog: [1],
    merkleLeaf: [1],
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
