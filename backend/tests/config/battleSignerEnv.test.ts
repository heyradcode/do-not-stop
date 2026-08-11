import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Neutralized, or this file tests whoever's `.env` happens to be on disk.
 *
 * `@config/env` imports `dotenv/config` for its side effect, and `vi.resetModules()` makes
 * that side effect run again on every re-import — so deleting a variable here would be
 * silently undone by the developer's own `.env` before the assertion ran. That is not a
 * hypothetical: it made the first version of this file pass against a *reverted* default.
 */
vi.mock('dotenv/config', () => ({}));

/**
 * The battle signer's attestation defaults (§F, §G).
 *
 * Worth its own test because every other signer test mocks `env`, so the default that a
 * real deployment actually runs under is exercised nowhere else. A default is configuration
 * only in the sense that it can be overridden; until someone does, it *is* the behaviour.
 */

const ORIGINAL = process.env;

beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL };
});

afterEach(() => {
    process.env = ORIGINAL;
});

async function loadEnv() {
    return (await import('@config/env')).env;
}

describe('BATTLE_SIGNER_REQUIRED_ATTESTERS', () => {
    /**
     * Both engines by default, which is what makes §F's circuit breaker a precondition for a
     * signature rather than a step earlier in the pipeline. The pipeline already refuses to
     * advance a battle whose independent verification disagreed, but that refusal is one
     * edit away from being removed; this one lives at the only place a receipt is produced.
     */
    it('requires the independent Go verifier by default', async () => {
        delete process.env.BATTLE_SIGNER_REQUIRED_ATTESTERS;

        expect((await loadEnv()).battleSigner.requiredAttesters).toEqual([
            'typescript-engine',
            'go-verifier',
        ]);
    });

    it('is overridable, for draining a queue during an indexer-go outage', async () => {
        process.env.BATTLE_SIGNER_REQUIRED_ATTESTERS = 'typescript-engine';

        expect((await loadEnv()).battleSigner.requiredAttesters).toEqual(['typescript-engine']);
    });

    it('ignores blanks and stray whitespace, so a trailing comma is not an empty attester', async () => {
        // An empty string would be an attester name nothing ever matches, which would make
        // every receipt unsignable for a reason that reads as a mystery.
        process.env.BATTLE_SIGNER_REQUIRED_ATTESTERS = ' typescript-engine , go-verifier , ';

        expect((await loadEnv()).battleSigner.requiredAttesters).toEqual([
            'typescript-engine',
            'go-verifier',
        ]);
    });
});
