import { assertProtocolDomain, type ProtocolDomain } from '../domain/deployment';
import { normalizeAccount } from '../encoding/bytes';

/**
 * What a delegated session key is allowed to sign.
 *
 * A closed set with exactly one member, and it stays closed. The value of a session key is
 * that its blast radius is legible: an owner approving one is told, in the wallet prompt,
 * the complete list of things it can do. Widening this later is a new schema version and a
 * new prompt, not a quiet addition, because a key someone approved for battles must never
 * silently gain the ability to do something else.
 *
 * Notably absent: defence consent. That is the one signature a defender relies on, and a
 * stolen session key must not be able to produce it. Also absent by construction rather
 * than by choice: anything on chain. `ItemCore.equip` and every transfer check
 * `msg.sender`, so a key the chain has never heard of cannot move an asset regardless of
 * what this says.
 */
export type SessionScope = 'battle-intent';

export const SESSION_SCOPES: readonly SessionScope[] = ['battle-intent'];

/**
 * A wallet's short-lived permission for a client-held key to sign battle intents for it.
 *
 * The problem this solves: §D requires the *wallet* to authorize each battle, because a
 * JWT is a bearer token the operator issues to itself and therefore proves nothing about
 * the owner's intent. That is correct and stays true. What it costs is a wallet prompt per
 * battle, which is a lot of friction for the most repeated action in the game.
 *
 * The delegation keeps the property and removes the prompt. The owner signs once, naming a
 * public key the *client* generated and holds; that key then signs intents. The operator
 * still cannot forge an intent, because it never sees the private key — which is the whole
 * reason a JWT was unacceptable. What changes is only how many times the human is asked.
 *
 * Deliberately bounded on three axes, because a session key is a strictly weaker
 * credential than a wallet and should look like one:
 *
 * - **Scope**, to battle intents alone (see `SessionScope`).
 * - **Time**, by a validity window the protocol caps rather than trusting a client to
 *   choose well (`MAX_SESSION_SECONDS`).
 * - **Revocation**, by a nonce the owner bumps, matching `DefenseAuthorization`.
 *
 * Not part of any receipt. The verifier never checks intent signatures — it checks the
 * seed, the beacon, the operator's signature, the replay, the progression and the chain —
 * so this is a backend authorization gate rather than public evidence. That is a
 * deliberate scoping decision: it keeps delegation out of the permanent, signed record,
 * so the mechanism can be revised without invalidating a single historical receipt.
 */
export interface SessionDelegation {
    domain: ProtocolDomain;
    /** Wallet delegating its battle-signing authority, and the signer of this object. */
    owner: string;
    /**
     * The delegated key, as an account string on the domain's chain family.
     *
     * An EVM address or a base58 Solana pubkey, in the same spelling `normalizeAccount`
     * produces, since it is compared against a recovered signer.
     */
    sessionKey: string;
    scope: SessionScope;
    /** Unix seconds. Validity window. */
    notBefore: number;
    expiresAt: number;
    /**
     * Bumped by the owner to invalidate every delegation signed at a lower value. Mirrors
     * `DefenseAuthorization.revocationNonce`, so an owner has one mental model for "cancel
     * what I signed" across both objects.
     */
    revocationNonce: number;
}

/**
 * Longest window a delegation may cover, enforced here rather than left to the client.
 *
 * A session key is held in browser storage, so it is exposed to anything that can run
 * script on the page. Twenty-four hours bounds what a stolen one is worth without making
 * the prompt frequent enough to be trained through. A client asking for longer is either
 * confused or hostile, and neither should be honoured by the validator.
 */
export const MAX_SESSION_SECONDS = 24 * 60 * 60;

const SAFE_ACCOUNT_PATTERN = /^[A-Za-z0-9._:-]+$/;

/** Validates an untrusted delegation, returning a normalized copy. */
export function assertSessionDelegation(delegation: SessionDelegation): SessionDelegation {
    const domain = assertProtocolDomain(delegation.domain);

    for (const [field, value] of [
        ['owner', delegation.owner],
        ['sessionKey', delegation.sessionKey],
    ] as const) {
        if (typeof value !== 'string' || !SAFE_ACCOUNT_PATTERN.test(value)) {
            throw new Error(`${field} is not a valid account: ${JSON.stringify(value)}`);
        }
    }

    const owner = normalizeAccount(delegation.owner);
    const sessionKey = normalizeAccount(delegation.sessionKey);
    if (owner === sessionKey) {
        // A delegation to yourself is not a delegation, and accepting one would make
        // "signed by the session key" and "signed by the owner" the same check.
        throw new Error('sessionKey must differ from owner');
    }

    if (!SESSION_SCOPES.includes(delegation.scope)) {
        throw new Error(`unknown session scope ${JSON.stringify(delegation.scope)}`);
    }

    assertUnixSeconds(delegation.notBefore, 'notBefore');
    assertUnixSeconds(delegation.expiresAt, 'expiresAt');
    if (delegation.expiresAt <= delegation.notBefore) {
        throw new Error(`expiresAt ${delegation.expiresAt} must be after notBefore ${delegation.notBefore}`);
    }
    if (delegation.expiresAt - delegation.notBefore > MAX_SESSION_SECONDS) {
        throw new Error(
            `a session delegation may not exceed ${MAX_SESSION_SECONDS}s; got ${delegation.expiresAt - delegation.notBefore}s`,
        );
    }

    if (!Number.isSafeInteger(delegation.revocationNonce) || delegation.revocationNonce < 0 || delegation.revocationNonce > 0xffffffff) {
        throw new Error(`revocationNonce must be 0-4294967295, got ${delegation.revocationNonce}`);
    }

    return {
        domain,
        owner,
        sessionKey,
        scope: delegation.scope,
        notBefore: delegation.notBefore,
        expiresAt: delegation.expiresAt,
        revocationNonce: delegation.revocationNonce,
    };
}

/** Why a delegation does not authorize a given signature. */
export type SessionFailure =
    | 'wrong-domain'
    | 'wrong-owner'
    | 'wrong-scope'
    | 'not-yet-valid'
    | 'expired'
    | 'wrong-session-key';

export interface SessionQuery {
    domain: ProtocolDomain;
    /** Wallet the intent claims to act for. */
    owner: string;
    /** Key that actually produced the signature. */
    sessionKey: string;
    scope: SessionScope;
    nowSeconds: number;
}

/**
 * Whether `delegation` lets `query.sessionKey` act for `query.owner` right now.
 *
 * Pure, and separate from anything that reads a database, for the same reason
 * `authorizationCovers` is: the rule about what a signature authorizes should be checkable
 * by anyone holding the delegation, not only by the process that stored it. Revocation is
 * the backend's half, since a pure function cannot know what an owner has since cancelled.
 */
export function sessionCovers(
    delegation: SessionDelegation,
    query: SessionQuery,
): { covered: true } | { covered: false; reason: SessionFailure } {
    const checked = assertSessionDelegation(delegation);

    if (
        checked.domain.chainId !== query.domain.chainId ||
        checked.domain.deploymentId !== query.domain.deploymentId
    ) {
        return { covered: false, reason: 'wrong-domain' };
    }
    if (checked.owner !== normalizeAccount(query.owner)) {
        return { covered: false, reason: 'wrong-owner' };
    }
    if (checked.sessionKey !== normalizeAccount(query.sessionKey)) {
        return { covered: false, reason: 'wrong-session-key' };
    }
    if (checked.scope !== query.scope) {
        return { covered: false, reason: 'wrong-scope' };
    }
    if (query.nowSeconds < checked.notBefore) {
        return { covered: false, reason: 'not-yet-valid' };
    }
    if (query.nowSeconds >= checked.expiresAt) {
        return { covered: false, reason: 'expired' };
    }
    return { covered: true };
}

function assertUnixSeconds(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1 || value > 0xffffffffffff) {
        throw new Error(`${field} must be a unix-seconds integer, got ${value}`);
    }
}
