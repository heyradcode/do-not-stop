import { writeHeader } from '../domain/deployment';
import type { Hex } from '../encoding/bytes';
import { DOMAIN_TAGS } from '../encoding/domain';
import { keccak256Hex } from '../encoding/hash';
import { CanonicalWriter } from '../encoding/writer';

import { assertDefenseAuthorization, type DefenseAuthorization } from './types';

/**
 * Canonical encoding of an authorization. Header first, then the §D field list.
 *
 * The scope encodes as a flag plus a list, and validation guarantees the two
 * cannot both be meaningful: a blanket authorization carries an empty list, an
 * explicit one carries a non-empty ascending list. So "all pets" and "these
 * pets" can never produce the same bytes.
 */
export function encodeDefenseAuthorization(auth: DefenseAuthorization): Uint8Array {
    const checked = assertDefenseAuthorization(auth);
    const writer = CanonicalWriter.withDomain(DOMAIN_TAGS.DEFENSE_AUTHORIZATION);
    const petIds = checked.scope.kind === 'pets' ? checked.scope.petIds : [];
    return writeHeader(writer, 'defenseAuthorization', checked.domain)
        .account(checked.defenderOwner)
        .bool(checked.scope.kind === 'allPets')
        .array(petIds, (w, petId) => w.u256(petId))
        .hash(checked.rulesetHash)
        .u16(checked.minLevel)
        .u16(checked.maxLevel)
        .u32(checked.maxBattlesPerDay)
        .u64(checked.notBefore)
        .u64(checked.expiresAt)
        .u32(checked.revocationNonce)
        .build();
}

/**
 * `defenseAuthorizationHash`: embedded in every receipt that relied on this
 * authorization (§G), so an outsider can check what the defender had agreed to
 * at the time of the battle rather than taking our word for it.
 */
export function hashDefenseAuthorization(auth: DefenseAuthorization): Hex {
    return keccak256Hex(encodeDefenseAuthorization(auth));
}
