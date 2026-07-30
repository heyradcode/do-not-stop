/**
 * Checks this service's `digitPair` against the monorepo's own port of it.
 *
 * The service re-implements `DnaLib.digitPair` rather than importing it, so it
 * stays deployable alone. That leaves the re-implementation unverified against
 * anything: traits.test.ts asserts values I computed myself, which agrees with
 * the code by construction.
 *
 * `shared/src/utils/combat/dna.ts` is an independent port that *is* checked
 * against the Solidity, via the golden vectors in
 * `contracts/test-vectors/battle.json`. Agreeing with it makes this port correct
 * transitively, without importing anything at build time.
 *
 * Skipped when the monorepo is absent, so the service still tests standalone. The
 * specifier is assembled at runtime rather than written as a literal: tsc resolves
 * a literal dynamic import, so a static path would make `pnpm typecheck` fail
 * wherever the monorepo is not checked out, which is exactly the isolation this
 * package is meant to keep.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { digitPair } from './traits.js';

const SHARED_DNA = join('..', 'shared', 'src', 'utils', 'combat', 'dna.ts');

interface DnaPort {
    digitPair: (dna: bigint, pairIdx: number) => bigint;
}

/** Resolved to an absolute file URL against this file, so the path is right at
 *  runtime while staying a plain string to tsc; see the note above. */
const loadSharedPort = async (): Promise<DnaPort> => {
    const specifier = new URL('../../shared/src/utils/combat/dna.ts', import.meta.url).href;
    return (await import(/* @vite-ignore */ specifier)) as DnaPort;
};

const describeIfPresent = existsSync(SHARED_DNA) ? describe : describe.skip;

describeIfPresent('digitPair vs the golden-vector-checked port', () => {
    it('agrees across every pair index, for DNA of every shape', async () => {
        const shared = await loadSharedPort();

        const samples = [
            0n,
            1n,
            99n,
            100n,
            7_934_056_188_134_207n,
            9_999_999_999_999_999n,
            1_000_000_000_000_000n,
            // Past the 16-digit DNA modulus: the two must not diverge on
            // oversized input either, since neither clamps.
            12_345_678_901_234_567_890n,
        ];

        for (const dna of samples) {
            for (let pair = 0; pair <= 7; pair++) {
                expect(digitPair(dna, pair), `dna=${dna} pair=${pair}`)
                    .toBe(shared.digitPair(dna, pair));
            }
        }
    });

    it('agrees across a sweep, not just hand-picked values', async () => {
        const shared = await loadSharedPort();

        for (let i = 0n; i < 500n; i++) {
            const dna = (i * 7_919_000_000_037n) % 10_000_000_000_000_000n;
            for (let pair = 0; pair <= 7; pair++) {
                expect(digitPair(dna, pair)).toBe(shared.digitPair(dna, pair));
            }
        }
    });
});
