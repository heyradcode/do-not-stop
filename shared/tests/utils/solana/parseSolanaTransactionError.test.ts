import { describe, it, expect } from 'vitest';
import { formatSolanaActionError } from '../../../src/utils/solana/parseSolanaTransactionError';

describe('formatSolanaActionError', () => {
    it('maps wallet rejection variants', () => {
        for (const msg of [
            'User rejected the request',
            'User denied transaction',
            'Wallet rejected the request',
            'Transaction cancelled',
        ]) {
            expect(formatSolanaActionError(msg)).toBe('Transaction cancelled in your wallet.');
        }
    });

    it('maps blockhash / expiry errors', () => {
        expect(formatSolanaActionError('Blockhash not found')).toMatch(/took too long to confirm/);
        expect(formatSolanaActionError('block height exceeded')).toMatch(/took too long to confirm/);
    });

    it('maps insufficient funds / lamports', () => {
        expect(formatSolanaActionError('insufficient funds')).toBe(
            'Not enough SOL in your wallet to pay for this transaction.',
        );
        expect(formatSolanaActionError('insufficient lamports for fee')).toBe(
            'Not enough SOL in your wallet to pay for this transaction.',
        );
    });

    it('maps switchboard reveal-not-ready', () => {
        expect(
            formatSolanaActionError('Switchboard oracle did not produce a reveal instruction'),
        ).toMatch(/randomness is still processing/);
    });

    // The two failures a stuck commit/reveal actually produces, and they need opposite
    // advice: expired randomness never settles no matter how long you wait, while an
    // unpublished one settles on the next attempt. Both used to reach the generic
    // fallback, which told a player to try again in the one case where that cannot work.
    it('tells an expired request to clear itself rather than retry', () => {
        for (const msg of ['RandomnessExpired', 'Switchboard randomness has expired']) {
            expect(formatSolanaActionError(msg)).toMatch(/Clear the pending request/);
        }
    });

    it('tells an unpublished request to wait', () => {
        for (const msg of ['RandomnessNotResolved', 'Switchboard randomness not yet revealed']) {
            expect(formatSolanaActionError(msg)).toMatch(/Wait a few seconds and try again/);
        }
    });

    // Expiry is the dead end; "still processing" is not. Sharing one message would send a
    // stuck player back to the button that cannot work.
    it('keeps the expiry message distinct from the still-processing one', () => {
        const expired = formatSolanaActionError('RandomnessExpired');
        const processing = formatSolanaActionError(
            'Switchboard oracle did not produce a reveal instruction',
        );
        expect(expired).not.toBe(processing);
    });

    it('maps an already-pending breed', () => {
        expect(formatSolanaActionError('BreedRequestAlreadyPending')).toMatch(/breed is already in progress/);
        expect(formatSolanaActionError('account already in use')).toMatch(/request is already in progress/);
    });

    it('maps cooldown and self-breed errors', () => {
        expect(formatSolanaActionError('PetNotReady')).toMatch(/still on cooldown/);
        expect(formatSolanaActionError('pet is on cooldown')).toMatch(/still on cooldown/);
        expect(formatSolanaActionError('CannotBreedSelf')).toBe('You cannot breed a pet with itself.');
    });

    it('returns the fallback for simulation / custom program errors', () => {
        expect(formatSolanaActionError('Transaction simulation failed')).toBe(
            'Transaction failed. Please try again.',
        );
        expect(formatSolanaActionError('custom program error: 0x1771', 'oops')).toBe('oops');
    });

    it('returns the fallback for unrecognized and empty errors', () => {
        expect(formatSolanaActionError('totally unknown thing')).toBe(
            'Transaction failed. Please try again.',
        );
        expect(formatSolanaActionError('')).toBe('Transaction failed. Please try again.');
    });

    it('reads the message from Error instances and { message } objects', () => {
        expect(formatSolanaActionError(new Error('User rejected'))).toBe(
            'Transaction cancelled in your wallet.',
        );
        expect(formatSolanaActionError({ message: 'CannotBreedSelf' })).toBe(
            'You cannot breed a pet with itself.',
        );
    });

    it('honors a custom fallback message', () => {
        expect(formatSolanaActionError('mystery', 'Custom fallback')).toBe('Custom fallback');
    });
});
