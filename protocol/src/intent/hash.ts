import { writeHeader } from '../domain/deployment';
import type { Hex } from '../encoding/bytes';
import { DOMAIN_TAGS } from '../encoding/domain';
import { keccak256Hex } from '../encoding/hash';
import { CanonicalWriter } from '../encoding/writer';

import { assertBattleIntent, type BattleIntent } from './types';

/**
 * Canonical encoding of an intent. Field order is the specification: header
 * (schema version, chain id, deployment id) then the §D field list.
 *
 * Pet ids encode as u256 rather than text, which also canonicalizes them: `"7"`
 * and `"07"` parse to one value instead of hashing differently.
 *
 * The version written is always the one this build produces. Intents expire in
 * minutes, so there is no old-version intent to re-verify later; receipts are the
 * long-lived object and will need a version parameter when they land.
 */
export function encodeBattleIntent(intent: BattleIntent): Uint8Array {
    const checked = assertBattleIntent(intent);
    const writer = CanonicalWriter.withDomain(DOMAIN_TAGS.INTENT);
    return writeHeader(writer, 'intent', checked.domain)
        .account(checked.attackerOwner)
        .u256(checked.attackerPetId)
        .account(checked.defenderOwner)
        .u256(checked.defenderPetId)
        .optional(checked.challengeId, (w, v) => w.text(v))
        .text(checked.clientNonce)
        .hash(checked.rulesetHash)
        .u64(checked.expiresAt)
        .build();
}

/**
 * `intentHash`: the value the ledger stores and every receipt references (§G).
 *
 * This is not what the wallet signs. The wallet signs the chain-specific payload
 * in `./signing`, which shows readable fields rather than an opaque digest. This
 * hash is how the backend and any verifier refer to one intent afterwards.
 */
export function hashBattleIntent(intent: BattleIntent): Hex {
    return keccak256Hex(encodeBattleIntent(intent));
}
