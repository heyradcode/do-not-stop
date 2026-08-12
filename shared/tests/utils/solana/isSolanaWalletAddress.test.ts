import { describe, it, expect } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { isSolanaWalletAddress } from '../../../src/utils/solana/isSolanaWalletAddress';

describe('isSolanaWalletAddress', () => {
    it('accepts a freshly generated wallet public key (on the ed25519 curve)', () => {
        const address = Keypair.generate().publicKey.toBase58();
        expect(isSolanaWalletAddress(address)).toBe(true);
    });

    it('trims surrounding whitespace before validating', () => {
        const address = Keypair.generate().publicKey.toBase58();
        expect(isSolanaWalletAddress(`  ${address}  `)).toBe(true);
    });

    it('rejects an off-curve address (a PDA)', () => {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from('seed')],
            Keypair.generate().publicKey,
        );
        expect(isSolanaWalletAddress(pda.toBase58())).toBe(false);
    });

    it('rejects the empty string and whitespace-only input', () => {
        expect(isSolanaWalletAddress('')).toBe(false);
        expect(isSolanaWalletAddress('   ')).toBe(false);
    });

    it('rejects strings that are not valid base58 public keys', () => {
        expect(isSolanaWalletAddress('not-a-real-address')).toBe(false);
        expect(isSolanaWalletAddress('0x52908400098527886e0f7030069857d2e4169ee7')).toBe(false);
    });

    it('rejects a base58 string of the wrong byte length', () => {
        expect(isSolanaWalletAddress('abc')).toBe(false);
    });
});
