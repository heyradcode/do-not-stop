import { assertProtocolDomain, type ProtocolDomain } from '../domain/deployment';
import { normalizeAccount } from '../encoding/bytes';

/**
 * One pet, frozen at acceptance. The "photo" from Part 1 of the architecture doc.
 *
 * Two jobs. First, the fight is decided entirely by values written down before any
 * randomness existed, so a level-up between acceptance and settlement cannot
 * reroll a committed battle (the same attack `GameLogic.sol` closed on chain by
 * snapshotting sim inputs). Second, it makes the battle replayable by a stranger:
 * every input the ruleset consumes is here, in the receipt, rather than read live
 * from a database only we can see.
 *
 * That second job is why progression state is included. XP depends on
 * same-opponent decay, which lives in `lastOpponentId` and `streak`; without them
 * in the snapshot, progression could only be recomputed by someone with access to
 * our tables, which is not replay.
 *
 * Equipment is deliberately absent. Nothing equips anything yet, and inventing the
 * field now would freeze a layout for a feature whose shape is undecided. Adding
 * it is a `snapshot` schema-version bump, which is the honest cost.
 */
export interface PetSnapshot {
    petId: bigint;
    /** Owner at snapshot time, per finalized chain state. */
    owner: string;
    /** 16-digit DNA, the sole source of base attributes. */
    dna: bigint;
    /** Rarity tier 1-5, the DNA multiplier. */
    rarity: number;
    level: number;
    /** Skill archetype 0-7, or any other value for "no archetype" (`NO_SKILL`). */
    skill: number;
    /** XP toward the next level at snapshot time. */
    xp: number;
    /** Previous opponent, or 0 for a pet that has not fought. Drives XP decay. */
    lastOpponentId: bigint;
    /** Consecutive prior battles against `lastOpponentId`. The XP decay shift. */
    streak: number;
    /** Unix seconds this pet becomes battle-ready. Lets a verifier check cooldown. */
    readyAt: number;
    /**
     * Indexed chain version the pet was read at (EVM block timestamp / Solana
     * slot), so a snapshot taken from an unfinalized write is identifiable after
     * the fact rather than merely suspected (threat T10).
     */
    sourceVersion: bigint;
}

/** Both pets, frozen together. This is what `snapshotHash` covers. */
export interface BattleSnapshot {
    domain: ProtocolDomain;
    attacker: PetSnapshot;
    defender: PetSnapshot;
    /** Unix seconds the snapshot was taken, which is acceptance time. */
    takenAt: number;
}

/** DNA is a 16-digit number on both chains (see `combat/dna.ts`). */
const MAX_DNA = 10n ** 16n;
const MAX_U256 = 1n << 256n;
const SAFE_ACCOUNT_PATTERN = /^[A-Za-z0-9._:-]+$/;

/** Validates one pet snapshot, returning a normalized copy. */
export function assertPetSnapshot(pet: PetSnapshot, label: string): PetSnapshot {
    if (typeof pet.petId !== 'bigint' || pet.petId <= 0n || pet.petId >= MAX_U256) {
        throw new Error(`${label}.petId is not a valid pet id: ${pet.petId}`);
    }
    if (typeof pet.owner !== 'string' || !SAFE_ACCOUNT_PATTERN.test(pet.owner)) {
        throw new Error(`${label}.owner is not a valid account: ${JSON.stringify(pet.owner)}`);
    }
    if (typeof pet.dna !== 'bigint' || pet.dna < 0n || pet.dna >= MAX_DNA) {
        throw new Error(`${label}.dna must be a 16-digit value, got ${pet.dna}`);
    }
    if (!Number.isSafeInteger(pet.rarity) || pet.rarity < 1 || pet.rarity > 5) {
        throw new Error(`${label}.rarity must be 1-5, got ${pet.rarity}`);
    }
    assertU16(pet.level, `${label}.level`, 1);
    assertU16(pet.skill, `${label}.skill`, 0);
    assertU32(pet.xp, `${label}.xp`);
    if (typeof pet.lastOpponentId !== 'bigint' || pet.lastOpponentId < 0n || pet.lastOpponentId >= MAX_U256) {
        throw new Error(`${label}.lastOpponentId must be a pet id or 0, got ${pet.lastOpponentId}`);
    }
    assertU32(pet.streak, `${label}.streak`);
    if (pet.lastOpponentId === 0n && pet.streak !== 0) {
        // A streak against nobody is not a state the chain can produce, so accepting
        // it would mean hashing a snapshot that cannot be reconciled with any
        // history. Reject it here rather than let it decay XP silently.
        throw new Error(`${label}.streak must be 0 when lastOpponentId is 0, got ${pet.streak}`);
    }
    assertUnixSeconds(pet.readyAt, `${label}.readyAt`, 0);
    if (typeof pet.sourceVersion !== 'bigint' || pet.sourceVersion < 0n || pet.sourceVersion >= 1n << 64n) {
        throw new Error(`${label}.sourceVersion must fit in 64 bits, got ${pet.sourceVersion}`);
    }
    return { ...pet, owner: normalizeAccount(pet.owner) };
}

/** Validates a battle snapshot, returning a normalized copy. */
export function assertBattleSnapshot(snapshot: BattleSnapshot): BattleSnapshot {
    const domain = assertProtocolDomain(snapshot.domain);
    const attacker = assertPetSnapshot(snapshot.attacker, 'attacker');
    const defender = assertPetSnapshot(snapshot.defender, 'defender');
    if (attacker.petId === defender.petId) {
        throw new Error(`a pet cannot fight itself (petId ${attacker.petId})`);
    }
    assertUnixSeconds(snapshot.takenAt, 'takenAt', 1);
    return { domain, attacker, defender, takenAt: snapshot.takenAt };
}

/** Whether a pet was off cooldown when the snapshot was taken. */
export function isBattleReady(pet: PetSnapshot, atSeconds: number): boolean {
    return atSeconds >= pet.readyAt;
}

function assertU16(value: number, field: string, min: number): void {
    if (!Number.isSafeInteger(value) || value < min || value > 0xffff) {
        throw new Error(`${field} must be ${min}-65535, got ${value}`);
    }
}

function assertU32(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
        throw new Error(`${field} must be 0-4294967295, got ${value}`);
    }
}

function assertUnixSeconds(value: number, field: string, min: number): void {
    if (!Number.isSafeInteger(value) || value < min || value > 0xffffffffffff) {
        throw new Error(`${field} must be a unix-seconds integer >= ${min}, got ${value}`);
    }
}
