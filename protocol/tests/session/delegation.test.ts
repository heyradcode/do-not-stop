import { describe, expect, it } from 'vitest';

import { hashSessionDelegation } from '../../src/session/hash';
import { sessionDelegationTypedData } from '../../src/session/signing';
import {
    assertSessionDelegation,
    MAX_SESSION_SECONDS,
    type SessionDelegation,
    sessionCovers,
} from '../../src/session/types';

/**
 * Delegated battle-intent signing (§D).
 *
 * §D's rule is that a wallet, not a bearer token, authorizes a battle, because a JWT is
 * something the operator issues to itself. A delegation keeps that property and drops the
 * per-battle prompt: the owner signs once, and a key the *client* generated signs intents.
 * The operator still cannot forge one, which is the whole point.
 *
 * These cases pin the bounds, since a session key is a strictly weaker credential than a
 * wallet and the validator is what keeps it that way.
 */

const DOMAIN = { chainId: 'eip155:84532' as const, deploymentId: 'base-sepolia-live' };
const OWNER = '0xabcdef0123456789abcdef0123456789abcdef01';
const SESSION_KEY = '0x1111111111111111111111111111111111111111';
const NOW = 1_800_000_000;

const delegation = (overrides: Partial<SessionDelegation> = {}): SessionDelegation => ({
    domain: DOMAIN,
    owner: OWNER,
    sessionKey: SESSION_KEY,
    scope: 'battle-intent',
    notBefore: NOW,
    expiresAt: NOW + 3600,
    revocationNonce: 0,
    ...overrides,
});

describe('assertSessionDelegation', () => {
    it('normalizes both accounts, since each is compared against a recovered signer', () => {
        const checked = assertSessionDelegation(
            delegation({ owner: OWNER.toUpperCase().replace('0X', '0x') }),
        );
        expect(checked.owner).toBe(OWNER);
        expect(checked.sessionKey).toBe(SESSION_KEY);
    });

    // A delegation to yourself is not a delegation, and accepting one would collapse
    // "signed by the session key" and "signed by the owner" into the same check.
    it('refuses a delegation to the owner itself', () => {
        expect(() => assertSessionDelegation(delegation({ sessionKey: OWNER }))).toThrow(/must differ/);
    });

    it('refuses a scope it does not implement', () => {
        expect(() =>
            assertSessionDelegation(delegation({ scope: 'transfer' as never })),
        ).toThrow(/unknown session scope/);
    });

    /**
     * The cap is enforced here rather than trusted to the client, because the key lives in
     * browser storage: how long a stolen one stays useful is exactly what this bounds, and
     * a client asking for a year is either confused or hostile.
     */
    it('refuses a window longer than the protocol cap', () => {
        expect(() =>
            assertSessionDelegation(delegation({ expiresAt: NOW + MAX_SESSION_SECONDS + 1 })),
        ).toThrow(/may not exceed/);
    });

    it('accepts a window exactly at the cap', () => {
        expect(() =>
            assertSessionDelegation(delegation({ expiresAt: NOW + MAX_SESSION_SECONDS })),
        ).not.toThrow();
    });

    it('refuses a window that ends before it starts', () => {
        expect(() => assertSessionDelegation(delegation({ expiresAt: NOW - 1 }))).toThrow(/must be after/);
    });
});

describe('sessionCovers', () => {
    const query = {
        domain: DOMAIN,
        owner: OWNER,
        sessionKey: SESSION_KEY,
        scope: 'battle-intent' as const,
        nowSeconds: NOW + 10,
    };

    it('covers its own key acting for its own owner, in window', () => {
        expect(sessionCovers(delegation(), query)).toEqual({ covered: true });
    });

    // The check that stops one player's session key acting for another wallet.
    it('refuses a different owner', () => {
        expect(sessionCovers(delegation(), { ...query, owner: SESSION_KEY })).toEqual({
            covered: false,
            reason: 'wrong-owner',
        });
    });

    it('refuses a different key', () => {
        expect(sessionCovers(delegation(), { ...query, sessionKey: '0x2222222222222222222222222222222222222222' })).toEqual({
            covered: false,
            reason: 'wrong-session-key',
        });
    });

    it('refuses before and after the window', () => {
        expect(sessionCovers(delegation(), { ...query, nowSeconds: NOW - 1 })).toEqual({
            covered: false,
            reason: 'not-yet-valid',
        });
        expect(sessionCovers(delegation(), { ...query, nowSeconds: NOW + 3600 })).toEqual({
            covered: false,
            reason: 'expired',
        });
    });

    // Staging and production issue different deployment ids on purpose, so a delegation
    // signed against one must not authorize anything on the other.
    it('refuses another deployment', () => {
        expect(
            sessionCovers(delegation(), { ...query, domain: { ...DOMAIN, deploymentId: 'staging' } }),
        ).toEqual({ covered: false, reason: 'wrong-domain' });
    });
});

describe('hashSessionDelegation', () => {
    it('changes when any signed field changes', () => {
        const base = hashSessionDelegation(delegation());
        expect(hashSessionDelegation(delegation({ revocationNonce: 1 }))).not.toBe(base);
        expect(hashSessionDelegation(delegation({ expiresAt: NOW + 7200 }))).not.toBe(base);
        expect(
            hashSessionDelegation(delegation({ sessionKey: '0x2222222222222222222222222222222222222222' })),
        ).not.toBe(base);
    });

    it('is stable under account spelling, matching what the validator normalizes to', () => {
        expect(hashSessionDelegation(delegation({ owner: OWNER.toUpperCase().replace('0X', '0x') }))).toBe(
            hashSessionDelegation(delegation()),
        );
    });
});

describe('sessionDelegationTypedData', () => {
    // Named fields, not a digest: this is the prompt where someone hands a key they will
    // never see again the ability to act for them.
    it('names every field the owner is agreeing to', () => {
        const typed = sessionDelegationTypedData(delegation());
        expect(typed.message.sessionKey).toBe(SESSION_KEY);
        expect(typed.message.scope).toBe('battle-intent');
        expect(typed.message.expiresAt).toBe(BigInt(NOW + 3600));
        expect(typed.types.SessionDelegation.map((f) => f.name)).toContain('sessionKey');
    });

    it('refuses to build EVM typed data for a Solana delegation', () => {
        expect(() =>
            sessionDelegationTypedData(delegation({ domain: { chainId: 'solana:devnet', deploymentId: 'd' } })),
        ).toThrow(/EIP-712 typed data is for EVM/);
    });
});
