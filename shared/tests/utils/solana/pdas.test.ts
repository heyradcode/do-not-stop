import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

import {
    breedRequestPda,
    feeVaultPda,
    globalStatePda,
    marriageProposalPda,
    mintRequestPda,
    petPdaByAsset,
    playerProfilePda,
    studFeeAccountPda,
} from '../../../src/utils/solana/pdas';

const programId = Keypair.generate().publicKey;
const owner = Keypair.generate().publicKey;

const isPdaResult = ([addr, bump]: [PublicKey, number]) => {
    expect(addr).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
};

describe('solana PDAs', () => {
    it('derives a deterministic global-state PDA', () => {
        const a = globalStatePda(programId);
        const b = globalStatePda(programId);
        isPdaResult(a);
        expect(a[0].equals(b[0])).toBe(true);
        expect(a[1]).toBe(b[1]);
    });

    it('derives distinct PDAs for different seeds', () => {
        const global = globalStatePda(programId)[0];
        const profile = playerProfilePda(programId, owner)[0];
        const breed = breedRequestPda(programId, owner)[0];

        const all = [global, profile, breed].map((k) => k.toBase58());
        expect(new Set(all).size).toBe(3);
    });

    it('ties the player profile PDA to its owner', () => {
        const otherOwner = Keypair.generate().publicKey;
        const a = playerProfilePda(programId, owner)[0];
        const b = playerProfilePda(programId, otherOwner)[0];
        expect(a.equals(b)).toBe(false);
    });

    // All eight kinds at once: two colliding would mean one account silently
    // standing in for another.
    it('gives all eight PDA kinds distinct addresses', () => {
        const asset = Keypair.generate().publicKey.toBase58();
        const all = [
            globalStatePda(programId)[0],
            feeVaultPda(programId)[0],
            playerProfilePda(programId, owner)[0],
            breedRequestPda(programId, owner)[0],
            mintRequestPda(programId, owner)[0],
            studFeeAccountPda(programId, owner)[0],
            petPdaByAsset(programId, asset)[0],
            marriageProposalPda(programId, 1)[0],
        ];
        all.forEach((a) => isPdaResult([a, 255]));
        expect(new Set(all.map((k) => k.toBase58())).size).toBe(all.length);
    });

    it('ties every owner-scoped PDA to its owner', () => {
        const otherOwner = Keypair.generate().publicKey;
        for (const derive of [breedRequestPda, mintRequestPda, studFeeAccountPda]) {
            expect(derive(programId, owner)[0].equals(derive(programId, otherOwner)[0])).toBe(false);
        }
    });

    it('ties the pet PDA to its Core asset address', () => {
        const a = petPdaByAsset(programId, Keypair.generate().publicKey.toBase58())[0];
        const b = petPdaByAsset(programId, Keypair.generate().publicKey.toBase58())[0];
        expect(a.equals(b)).toBe(false);
    });

    /**
     * The program derives this with `pet_a.id.to_le_bytes()`. Endianness is not
     * cosmetic here: big-endian gives a different address for every id but a
     * palindromic one, so every proposal lookup would miss an account that exists.
     */
    it('encodes the marriage proposal id little-endian, as the program does', () => {
        const id = 0x01020304;
        const seed = Buffer.from('marriage-proposal');

        const le = Buffer.alloc(4);
        le.writeUInt32LE(id, 0);
        const be = Buffer.alloc(4);
        be.writeUInt32BE(id, 0);

        const actual = marriageProposalPda(programId, id)[0];
        expect(actual.equals(PublicKey.findProgramAddressSync([seed, le], programId)[0])).toBe(true);
        expect(actual.equals(PublicKey.findProgramAddressSync([seed, be], programId)[0])).toBe(false);
    });
});

// ── Cross-language: every seed above is a hand-copy of the program's ─────────────
const here = dirname(fileURLToPath(import.meta.url));
const PROGRAM_SRC = join(here, '../../../../contracts/solana/cryptopets/programs/cryptopets/src');

/** Every seed string this module builds a PDA from. */
const SEEDS = [
    'global-state', 'player-profile', 'pet', 'breed-request',
    'marriage-proposal', 'fee-vault', 'mint-request', 'stud-fee',
];

const rustSources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
            ? rustSources(join(dir, e.name))
            : e.name.endsWith('.rs') ? [join(dir, e.name)] : []);

// Skipped where the contracts are absent, matching how the repo's other
// cross-language specs degrade.
const describeIfProgram = existsSync(PROGRAM_SRC) ? describe : describe.skip;

describeIfProgram('PDA seeds vs the Anchor program', () => {
    // Guards the guard: an empty source list would agree with anything.
    it('finds the program sources', () => {
        expect(rustSources(PROGRAM_SRC).length).toBeGreaterThan(10);
    });

    // A seed renamed in Rust but not here derives a valid-looking address for an
    // account that does not exist, on every Solana read this client makes.
    it('declares every seed this module uses', () => {
        const rust = rustSources(PROGRAM_SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
        const missing = SEEDS.filter((seed) => !rust.includes(`b"${seed}"`));
        expect(missing, `seeds absent from the program: ${missing.join(', ')}`).toEqual([]);
    });
});
