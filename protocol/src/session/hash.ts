import { writeHeader } from '../domain/deployment';
import type { Hex } from '../encoding/bytes';
import { DOMAIN_TAGS } from '../encoding/domain';
import { keccak256Hex } from '../encoding/hash';
import { CanonicalWriter } from '../encoding/writer';

import { assertSessionDelegation, type SessionDelegation } from './types';

/**
 * Canonical encoding of a session delegation. Header first, then the field list.
 *
 * `scope` encodes as text rather than as an index into `SESSION_SCOPES`. An index would
 * make the meaning of a stored delegation depend on the order of a constant, so reordering
 * that array — an edit nobody would think twice about — would silently re-interpret every
 * delegation ever signed.
 */
export function encodeSessionDelegation(delegation: SessionDelegation): Uint8Array {
    const checked = assertSessionDelegation(delegation);
    const writer = CanonicalWriter.withDomain(DOMAIN_TAGS.SESSION_DELEGATION);
    return writeHeader(writer, 'sessionDelegation', checked.domain)
        .account(checked.owner)
        .account(checked.sessionKey)
        .text(checked.scope)
        .u64(checked.notBefore)
        .u64(checked.expiresAt)
        .u32(checked.revocationNonce)
        .build();
}

/**
 * `sessionDelegationHash`: the delegation's identity for storage and revocation.
 *
 * Not embedded in any receipt, unlike `defenseAuthorizationHash`. The verifier does not
 * check intent signatures at all, so how an intent came to be signed is a backend
 * authorization question rather than part of the public record.
 */
export function hashSessionDelegation(delegation: SessionDelegation): Hex {
    return keccak256Hex(encodeSessionDelegation(delegation));
}
