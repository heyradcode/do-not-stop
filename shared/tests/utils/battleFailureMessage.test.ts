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
    it('flags the ones the defender fixes by granting consent', () => {
        for (const code of ['no-authorization', 'pet-not-covered', 'revoked']) {
            expect(isConsentFailure(rejection(code))).toBe(true);
            expect(isConsentFailure(toBattleRejection(rejection(code)))).toBe(true);
        }
    });

    it('does not flag refusals consent cannot fix', () => {
        for (const code of ['attacker-not-ready', 'expired', 'self-battle']) {
            expect(isConsentFailure(rejection(code))).toBe(false);
        }
    });
});
