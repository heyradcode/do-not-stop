import { describe, expect, it } from 'vitest';

import {
    isBattleRejection,
    isConsentFailure,
    toBattleRejection,
} from '../../src/utils/battleFailureMessage';

/** Shaped like the Axios error the api client throws for a 4xx. */
const rejection = (code: string) => ({ response: { data: { error: code, detail: 'why' } } });

describe('explaining a server refusal', () => {
    it('maps the reason a defender has not granted consent', () => {
        const err = toBattleRejection(rejection('no-authorization'));
        expect(err?.message).toBe("This opponent's owner has not allowed challenges yet.");
        expect(err?.code).toBe('no-authorization');
    });

    it('distinguishes refusals that look identical without the code', () => {
        const messages = ['attacker-not-ready', 'defender-not-ready', 'no-authorization', 'revoked']
            .map((code) => toBattleRejection(rejection(code))?.message);
        expect(new Set(messages).size).toBe(4);
    });

    it('keeps an unmapped code visible rather than hiding it behind a generic message', () => {
        const err = toBattleRejection(rejection('some-future-reason'));
        expect(err?.message).toBe('Battle refused: some-future-reason');
    });

    it('returns null for a failure the server did not explain', () => {
        expect(toBattleRejection(new Error('Network Error'))).toBeNull();
        expect(toBattleRejection({ response: { data: {} } })).toBeNull();
        expect(toBattleRejection(null)).toBeNull();
        expect(toBattleRejection(undefined)).toBeNull();
    });
});

describe('tagging', () => {
    it('is recognisable without instanceof, so a duplicate module copy still matches', () => {
        const err = toBattleRejection(rejection('expired'));
        expect(isBattleRejection(err)).toBe(true);
        expect(isBattleRejection(new Error('expired'))).toBe(false);
        expect(isBattleRejection(null)).toBe(false);
    });

    it('is a real Error, so existing error plumbing keeps working', () => {
        const err = toBattleRejection(rejection('expired'));
        expect(err).toBeInstanceOf(Error);
        expect(err?.name).toBe('BattleRejectionError');
    });
});

describe('consent failures', () => {
    /**
     * One per condition in matchmaking's `hasConsent` predicate
     * (`backend/src/repositories/roster.repository.ts`). Callers drop the opponent and
     * re-read the list on these, so the two sets have to agree: a code here that
     * matchmaking does not filter drops opponents who were fine, and one missing leaves
     * the player re-picking the only choice that cannot succeed.
     */
    it('flags every refusal that means the opponent should not have been listed', () => {
        for (const code of [
            'no-authorization', // EXISTS (...) — no grant at all
            'pet-not-covered', // all_pets OR pet_ids @> pet
            'revoked', // revoked_at IS NULL
            'expired', // expires_at > now
            'not-yet-valid', // not_before <= now
            'ruleset-mismatch', // ruleset_hash = current
        ]) {
            expect(isConsentFailure(rejection(code))).toBe(true);
            expect(isConsentFailure(toBattleRejection(rejection(code)))).toBe(true);
        }
    });

    // Excluded from the predicate on purpose, and excluded here for the same reason:
    // these are about this attacker, or about today, not about whether the opponent can
    // be challenged at all. Dropping them from the list over one would be wrong.
    it('does not flag refusals that are about the attacker or the day', () => {
        for (const code of [
            'attacker-level-below-band',
            'attacker-level-above-band',
            'daily-cap-reached',
            'attacker-not-ready',
            'self-battle',
        ]) {
            expect(isConsentFailure(rejection(code))).toBe(false);
        }
    });

    // `expired` is the authorization's own window closing, not the request's. Reading it
    // as the latter told the player to retry something that cannot succeed until the
    // defender acts, and left the opponent in the list to be picked again.
    it('keeps the two expiries apart', () => {
        expect(toBattleRejection(rejection('expired'))?.message).toContain('opponent');
        expect(toBattleRejection(rejection('intent-expired'))?.message).toContain('battle request');
        expect(isConsentFailure(rejection('intent-expired'))).toBe(false);
    });
});
