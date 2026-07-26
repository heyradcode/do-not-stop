import { describe, expect, it } from 'vitest';

import { simulate } from '../../src/combat';
import {
    assertBattleSnapshot,
    assertPetSnapshot,
    type BattleSnapshot,
    isBattleReady,
    type PetSnapshot,
} from '../../src/snapshot';

const ATTACKER: PetSnapshot = {
    petId: 1n,
    owner: '0xabcdef0123456789abcdef0123456789abcdef01',
    dna: 1234567890123456n,
    rarity: 3,
    level: 10,
    skill: 4,
    xp: 120,
    lastOpponentId: 0n,
    streak: 0,
    readyAt: 1861919000,
    sourceVersion: 1861918000n,
};

const DEFENDER: PetSnapshot = {
    ...ATTACKER,
    petId: 2n,
    owner: '0x2222222222222222222222222222222222222222',
    dna: 6543210987654321n,
    rarity: 2,
    level: 11,
    skill: 7,
    xp: 45,
    lastOpponentId: 1n,
    streak: 2,
};

const SNAPSHOT: BattleSnapshot = {
    domain: { chainId: 'eip155:84532', deploymentId: 'base-sepolia-live' },
    attacker: ATTACKER,
    defender: DEFENDER,
    takenAt: 1861920000,
};

describe('assertPetSnapshot', () => {
    it('normalizes the owner', () => {
        const checked = assertPetSnapshot(
            { ...ATTACKER, owner: '0xABCDEF0123456789abcdef0123456789ABCDEF01' },
            'attacker',
        );
        expect(checked.owner).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
    });

    it.each([0n, -1n])('rejects petId %s', (petId) => {
        expect(() => assertPetSnapshot({ ...ATTACKER, petId }, 'attacker')).toThrow(/attacker.petId/);
    });

    it('rejects DNA wider than 16 digits', () => {
        expect(() => assertPetSnapshot({ ...ATTACKER, dna: 10n ** 16n }, 'attacker')).toThrow(/16-digit/);
    });

    it('accepts the largest 16-digit DNA', () => {
        expect(() => assertPetSnapshot({ ...ATTACKER, dna: 10n ** 16n - 1n }, 'attacker')).not.toThrow();
    });

    it.each([0, 6, -1])('rejects rarity %s', (rarity) => {
        expect(() => assertPetSnapshot({ ...ATTACKER, rarity }, 'attacker')).toThrow(/rarity must be 1-5/);
    });

    it('rejects level 0, since no pet is level 0', () => {
        expect(() => assertPetSnapshot({ ...ATTACKER, level: 0 }, 'attacker')).toThrow(/level/);
    });

    it('accepts any skill value, since anything outside 0-7 means no archetype', () => {
        // NO_SKILL is 99 in the vectors, but the simulator treats every value
        // outside 0-7 the same way, so the snapshot must not narrow it further.
        for (const skill of [0, 7, 99, 65535]) {
            expect(() => assertPetSnapshot({ ...ATTACKER, skill }, 'attacker')).not.toThrow();
        }
    });

    it('rejects a streak against nobody', () => {
        // The chain cannot produce this state, so hashing it would freeze a
        // snapshot that reconciles with no history.
        expect(() => assertPetSnapshot({ ...ATTACKER, lastOpponentId: 0n, streak: 1 }, 'attacker')).toThrow(
            /streak must be 0 when lastOpponentId is 0/,
        );
    });

    it('allows a zero streak against a real previous opponent', () => {
        expect(() => assertPetSnapshot({ ...ATTACKER, lastOpponentId: 5n, streak: 0 }, 'attacker')).not.toThrow();
    });

    it('rejects a sourceVersion wider than 64 bits', () => {
        expect(() => assertPetSnapshot({ ...ATTACKER, sourceVersion: 1n << 64n }, 'attacker')).toThrow(
            /sourceVersion/,
        );
    });

    it('names the pet it is complaining about', () => {
        expect(() => assertPetSnapshot({ ...DEFENDER, rarity: 9 }, 'defender')).toThrow(/defender.rarity/);
    });
});

describe('assertBattleSnapshot', () => {
    it('accepts a valid snapshot', () => {
        expect(() => assertBattleSnapshot(SNAPSHOT)).not.toThrow();
    });

    it('rejects a pet fighting itself', () => {
        expect(() => assertBattleSnapshot({ ...SNAPSHOT, defender: { ...DEFENDER, petId: ATTACKER.petId } })).toThrow(
            /cannot fight itself/,
        );
    });

    it('rejects an invalid domain', () => {
        expect(() =>
            assertBattleSnapshot({ ...SNAPSHOT, domain: { ...SNAPSHOT.domain, deploymentId: 'Live' } }),
        ).toThrow(/invalid deploymentId/);
    });

    it('rejects takenAt of 0', () => {
        expect(() => assertBattleSnapshot({ ...SNAPSHOT, takenAt: 0 })).toThrow(/takenAt/);
    });
});

describe('isBattleReady', () => {
    it('takes the time as an argument', () => {
        expect(isBattleReady(ATTACKER, ATTACKER.readyAt - 1)).toBe(false);
        expect(isBattleReady(ATTACKER, ATTACKER.readyAt)).toBe(true);
    });

    it('lets a verifier check cooldown from the receipt alone', () => {
        expect(isBattleReady(SNAPSHOT.attacker, SNAPSHOT.takenAt)).toBe(true);
        expect(isBattleReady(SNAPSHOT.defender, SNAPSHOT.takenAt)).toBe(true);
    });
});

describe('snapshot completeness', () => {
    it('carries every input the fight function needs', () => {
        // The point of the snapshot: a fight is reproducible from it plus a seed,
        // with nothing read live. If this ever needs a field the snapshot lacks,
        // this test is where that shows up.
        const outcome = simulate(
            SNAPSHOT.attacker.dna,
            SNAPSHOT.attacker.rarity,
            SNAPSHOT.attacker.level,
            SNAPSHOT.attacker.skill,
            SNAPSHOT.defender.dna,
            SNAPSHOT.defender.rarity,
            SNAPSHOT.defender.level,
            SNAPSHOT.defender.skill,
            1n,
        );
        expect(outcome.result.rounds).toBeGreaterThan(0);
        expect(outcome.log.length).toBeGreaterThan(0);
    });
});
