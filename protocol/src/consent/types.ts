import { assertProtocolDomain, type ProtocolDomain } from '../domain/deployment';
import { type Hex, hexToBytes, normalizeAccount } from '../encoding/bytes';

/**
 * Which of a defender's pets an authorization covers.
 *
 * `allPets` is a standing "anyone may challenge me" that keeps covering pets
 * minted or bought after signing. An explicit list is the conservative form.
 */
export type DefenseScope = { kind: 'allPets' } | { kind: 'pets'; petIds: readonly bigint[] };

/**
 * A defender's long-lived, signed permission to be challenged.
 *
 * The problem this solves: the current EVM contract lets anyone attack anyone's
 * pet, which backend ranked mode should not copy, because it would apply cooldown
 * and rating changes to an unwilling defender. But demanding a live signature per
 * battle means you can only fight players who are online, which is a large
 * product regression. So consent is signed once, in advance, and bounded.
 *
 * Consent is bound to `rulesetHash`: a rules change invalidates outstanding
 * authorizations rather than silently re-interpreting old consent under new
 * combat math. Expect a re-consent prompt after every balance patch. That is the
 * intended cost, and it is what makes "I agreed to the old rules" not a dispute.
 *
 * See architecture §D. Live PvP is this same object with a short `expiresAt`.
 */
export interface DefenseAuthorization {
    domain: ProtocolDomain;
    /** Wallet that owns the defending pets and signs this authorization. */
    defenderOwner: string;
    scope: DefenseScope;
    /** The exact ruleset version being consented to. */
    rulesetHash: Hex;
    /** Inclusive attacker-level band the defender accepts. */
    minLevel: number;
    maxLevel: number;
    /**
     * Ceiling on battles per day against this authorization. Enforced by the
     * backend's counter, since a pure function cannot know a count; the receipt
     * records which authorization it relied on so the count is auditable.
     */
    maxBattlesPerDay: number;
    /** Unix seconds. Validity window. */
    notBefore: number;
    expiresAt: number;
    /**
     * Bumped by the owner to invalidate every authorization signed at a lower
     * value. Revocation is immediate and recorded in the ledger; its timestamp
     * goes into any affected receipt (§D).
     */
    revocationNonce: number;
}

const SAFE_ACCOUNT_PATTERN = /^[A-Za-z0-9._:-]+$/;

/** Upper bound on an explicit pet list, so one signature cannot carry an unbounded set. */
export const MAX_SCOPE_PET_IDS = 256;

/** Validates an untrusted authorization, returning a normalized copy. */
export function assertDefenseAuthorization(auth: DefenseAuthorization): DefenseAuthorization {
    const domain = assertProtocolDomain(auth.domain);

    if (typeof auth.defenderOwner !== 'string' || !SAFE_ACCOUNT_PATTERN.test(auth.defenderOwner)) {
        throw new Error(`defenderOwner is not a valid account: ${JSON.stringify(auth.defenderOwner)}`);
    }

    const scope = assertScope(auth.scope);

    if (hexToBytes(auth.rulesetHash).length !== 32) {
        throw new Error('rulesetHash must be a 32-byte hash');
    }

    assertLevel(auth.minLevel, 'minLevel');
    assertLevel(auth.maxLevel, 'maxLevel');
    if (auth.minLevel > auth.maxLevel) {
        throw new Error(`minLevel ${auth.minLevel} exceeds maxLevel ${auth.maxLevel}`);
    }

    if (!Number.isSafeInteger(auth.maxBattlesPerDay) || auth.maxBattlesPerDay < 1 || auth.maxBattlesPerDay > 0xffffffff) {
        // Zero would not be a limit, it would be a refusal, and a refusal is
        // expressed by not signing.
        throw new Error(`maxBattlesPerDay must be between 1 and 2^32-1, got ${auth.maxBattlesPerDay}`);
    }

    assertUnixSeconds(auth.notBefore, 'notBefore');
    assertUnixSeconds(auth.expiresAt, 'expiresAt');
    if (auth.notBefore >= auth.expiresAt) {
        throw new Error(`notBefore ${auth.notBefore} must be before expiresAt ${auth.expiresAt}`);
    }

    if (!Number.isSafeInteger(auth.revocationNonce) || auth.revocationNonce < 0 || auth.revocationNonce > 0xffffffff) {
        throw new Error(`revocationNonce must be between 0 and 2^32-1, got ${auth.revocationNonce}`);
    }

    return {
        domain,
        defenderOwner: normalizeAccount(auth.defenderOwner),
        scope,
        rulesetHash: auth.rulesetHash,
        minLevel: auth.minLevel,
        maxLevel: auth.maxLevel,
        maxBattlesPerDay: auth.maxBattlesPerDay,
        notBefore: auth.notBefore,
        expiresAt: auth.expiresAt,
        revocationNonce: auth.revocationNonce,
    };
}

/** Why an authorization does not cover a battle. */
export type CoverageFailure =
    | 'not-yet-valid'
    | 'expired'
    | 'pet-not-covered'
    | 'attacker-level-below-band'
    | 'attacker-level-above-band'
    | 'ruleset-mismatch';

export type CoverageResult = { covered: true } | { covered: false; reason: CoverageFailure };

/** What a specific battle needs the authorization to permit. */
export interface CoverageQuery {
    defenderPetId: bigint;
    attackerLevel: number;
    rulesetHash: Hex;
    /** Unix seconds. Always passed in: protocol code never reads the clock. */
    nowSeconds: number;
}

/**
 * Whether this authorization permits one specific battle.
 *
 * Deliberately returns a reason rather than a bare boolean, because "the
 * defender does not accept challenges from level 3" and "the authorization
 * expired" are different answers for the player and different alerts for us.
 *
 * `maxBattlesPerDay` is *not* checked here: it needs a count this function
 * cannot see. The backend enforces it.
 */
export function authorizationCovers(auth: DefenseAuthorization, query: CoverageQuery): CoverageResult {
    if (query.nowSeconds < auth.notBefore) {
        return { covered: false, reason: 'not-yet-valid' };
    }
    if (query.nowSeconds >= auth.expiresAt) {
        return { covered: false, reason: 'expired' };
    }
    if (auth.rulesetHash.toLowerCase() !== query.rulesetHash.toLowerCase()) {
        return { covered: false, reason: 'ruleset-mismatch' };
    }
    if (auth.scope.kind === 'pets' && !auth.scope.petIds.includes(query.defenderPetId)) {
        return { covered: false, reason: 'pet-not-covered' };
    }
    if (query.attackerLevel < auth.minLevel) {
        return { covered: false, reason: 'attacker-level-below-band' };
    }
    if (query.attackerLevel > auth.maxLevel) {
        return { covered: false, reason: 'attacker-level-above-band' };
    }
    return { covered: true };
}

function assertScope(scope: DefenseScope): DefenseScope {
    if (scope.kind === 'allPets') {
        return { kind: 'allPets' };
    }
    if (scope.kind !== 'pets') {
        throw new Error(`unknown defense scope: ${JSON.stringify(scope)}`);
    }
    const { petIds } = scope;
    if (!Array.isArray(petIds) || petIds.length === 0) {
        throw new Error('an explicit pet scope must list at least one pet; use allPets for a blanket authorization');
    }
    if (petIds.length > MAX_SCOPE_PET_IDS) {
        throw new Error(`a pet scope may not exceed ${MAX_SCOPE_PET_IDS} pets, got ${petIds.length}`);
    }
    // Strictly ascending, not merely valid. The owner consents to a *set*, so one
    // set must have one hash; sorting silently would make the hash disagree with
    // the order the wallet displayed, and accepting any order would give one set
    // as many hashes as it has permutations. Duplicates fall out of the same rule.
    for (let i = 0; i < petIds.length; i++) {
        const petId = petIds[i];
        if (typeof petId !== 'bigint' || petId <= 0n || petId >= 1n << 256n) {
            throw new Error(`scope pet id at index ${i} is not a valid pet id: ${petId}`);
        }
        const previous = petIds[i - 1];
        if (previous !== undefined && petId <= previous) {
            throw new Error(`scope pet ids must be strictly ascending; ${petId} follows ${previous}`);
        }
    }
    return { kind: 'pets', petIds: [...petIds] };
}

function assertLevel(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff) {
        throw new Error(`${field} must be between 1 and 65535, got ${value}`);
    }
}

function assertUnixSeconds(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 0xffffffffffff) {
        throw new Error(`${field} must be a positive unix-seconds integer, got ${value}`);
    }
}
