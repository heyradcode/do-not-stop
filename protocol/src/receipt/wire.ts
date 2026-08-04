import type { PetProgression } from '../progression/progression';
import type { BattleSnapshot, PetSnapshot } from '../snapshot/types';

import type { BattleReceipt } from './types';

/**
 * JSON wire form of a `BattleReceipt`: identical shape, except the bigint fields (pet id,
 * dna, last-opponent id, source version) travel as decimal strings, since JSON has no
 * bigint type. This is exactly what the backend's public receipt endpoints actually serve —
 * `backend/src/features/battle-worker/sign.worker.ts` stores the receipt through a
 * `JSON.stringify(receipt, bigint -> string)` replacer, and the read/corpus routes hand that
 * stored payload back unchanged.
 *
 * `receiptFromWire` converts only; it does not validate. `assertBattleReceipt` is what makes
 * a converted receipt trustworthy — a field that fails to convert cleanly (a non-numeric
 * string handed to `BigInt(...)`) throws before that even runs, and everything else
 * (ranges, hash consistency, chain-link shape) is `assertBattleReceipt`'s job, not this one's.
 */
export type WireBattleReceipt = Omit<BattleReceipt, 'snapshot' | 'progression'> & {
    snapshot: WireBattleSnapshot;
    progression: WireProgressionDelta;
};

export type WireBattleSnapshot = Omit<BattleSnapshot, 'attacker' | 'defender'> & {
    attacker: WirePetSnapshot;
    defender: WirePetSnapshot;
};

export type WirePetSnapshot = Omit<PetSnapshot, 'petId' | 'dna' | 'lastOpponentId' | 'sourceVersion'> & {
    petId: string;
    dna: string;
    lastOpponentId: string;
    sourceVersion: string;
};

export interface WireProgressionDelta {
    attacker: WirePetProgression;
    defender: WirePetProgression;
}

export type WirePetProgression = Omit<PetProgression, 'petId' | 'lastOpponentId'> & {
    petId: string;
    lastOpponentId: string;
};

/** Converts a JSON-wire receipt (bigints as decimal strings) into a typed `BattleReceipt`. */
export function receiptFromWire(wire: WireBattleReceipt): BattleReceipt {
    return {
        ...wire,
        snapshot: {
            ...wire.snapshot,
            attacker: petSnapshotFromWire(wire.snapshot.attacker),
            defender: petSnapshotFromWire(wire.snapshot.defender),
        },
        progression: {
            attacker: petProgressionFromWire(wire.progression.attacker),
            defender: petProgressionFromWire(wire.progression.defender),
        },
    };
}

function petSnapshotFromWire(pet: WirePetSnapshot): PetSnapshot {
    return {
        ...pet,
        petId: BigInt(pet.petId),
        dna: BigInt(pet.dna),
        lastOpponentId: BigInt(pet.lastOpponentId),
        sourceVersion: BigInt(pet.sourceVersion),
    };
}

function petProgressionFromWire(pet: WirePetProgression): PetProgression {
    return {
        ...pet,
        petId: BigInt(pet.petId),
        lastOpponentId: BigInt(pet.lastOpponentId),
    };
}
