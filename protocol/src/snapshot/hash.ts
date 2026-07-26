import { writeHeader } from '../domain/deployment';
import type { Hex } from '../encoding/bytes';
import { DOMAIN_TAGS } from '../encoding/domain';
import { keccak256Hex } from '../encoding/hash';
import { CanonicalWriter } from '../encoding/writer';

import { assertBattleSnapshot, type BattleSnapshot, type PetSnapshot } from './types';

/**
 * Canonical encoding of a frozen battle snapshot: header, attacker, defender,
 * `takenAt`.
 *
 * Attacker and defender are written in role order, not sorted by pet id. Roles are
 * not symmetric here (the attacker pays, the attacker's `firstWins` defines the
 * result), so swapping the two must produce a different hash.
 *
 * No `battleId` is included. A snapshot describes pets, and the commitment is what
 * binds one snapshot to one battle by signing `battleId` and `snapshotHash`
 * together (§E).
 */
export function encodeBattleSnapshot(snapshot: BattleSnapshot): Uint8Array {
    const checked = assertBattleSnapshot(snapshot);
    const writer = CanonicalWriter.withDomain(DOMAIN_TAGS.SNAPSHOT);
    writeHeader(writer, 'snapshot', checked.domain);
    writePet(writer, checked.attacker);
    writePet(writer, checked.defender);
    return writer.u64(checked.takenAt).build();
}

/** `snapshotHash`: carried by the commitment (§E) and the receipt (§G). */
export function hashBattleSnapshot(snapshot: BattleSnapshot): Hex {
    return keccak256Hex(encodeBattleSnapshot(snapshot));
}

function writePet(writer: CanonicalWriter, pet: PetSnapshot): void {
    writer
        .u256(pet.petId)
        .account(pet.owner)
        .u256(pet.dna)
        .u8(pet.rarity)
        .u16(pet.level)
        .u16(pet.skill)
        .u32(pet.xp)
        .u256(pet.lastOpponentId)
        .u32(pet.streak)
        .u64(pet.readyAt)
        .u64(pet.sourceVersion);
}
