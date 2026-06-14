import { describe, it, expect } from 'vitest';
import { parseContractError } from '../../../src/utils/ethereum/errorParser';

describe('parseContractError', () => {
    describe('user rejection', () => {
        it.each([
            'User rejected the request',
            'MetaMask Tx Signature: User denied transaction signature',
            'The user rejected the action',
        ])('flags "%s" as a user rejection', (message) => {
            const result = parseContractError({ message });
            expect(result).toEqual({
                message: 'Transaction cancelled by user',
                isUserRejection: true,
                isContractError: false,
            });
        });
    });

    describe('contract reverts', () => {
        it('maps the "already have a pet" revert to a friendly message', () => {
            const result = parseContractError({
                message: 'execution reverted: You already have a pet',
            });
            expect(result.isContractError).toBe(true);
            expect(result.isUserRejection).toBe(false);
            expect(result.message).toBe(
                '🐾 You already have a pet! Create a new one by breeding or battling.',
            );
        });

        it('extracts the viem-style revert reason', () => {
            const result = parseContractError({
                message:
                    'reverted with the following reason: not the owner Contract Call: ...',
            });
            expect(result.isContractError).toBe(true);
            expect(result.message).toBe('🔒 You are not authorized to perform this action.');
        });

        it('maps insufficient-funds reverts', () => {
            const result = parseContractError({
                message: 'execution reverted: insufficient funds for transfer',
            });
            expect(result.message).toBe('💰 Insufficient funds for this transaction.');
        });

        it('returns the plain generic message when the extracted reason is unmapped', () => {
            // The reason "SomeCustomError()" matches none of the friendly buckets,
            // so mapRevertReasonToFriendlyMessage returns its own default.
            const result = parseContractError({
                message: 'execution reverted: SomeCustomError()',
            });
            expect(result.isContractError).toBe(true);
            expect(result.message).toBe('Transaction failed. Please try again.');
        });

        it('uses the ⚠️ message when the reason itself mentions a reverted transaction', () => {
            const result = parseContractError({
                message: 'execution reverted: transaction reverted without a reason',
            });
            expect(result.isContractError).toBe(true);
            expect(result.message).toBe(
                '⚠️ Transaction failed. This might be due to contract rules or insufficient gas.',
            );
        });
    });

    describe('non-contract categories', () => {
        it('detects network errors', () => {
            const result = parseContractError({ message: 'network connection timeout' });
            expect(result).toEqual({
                message: 'Network error. Please check your connection and try again.',
                isUserRejection: false,
                isContractError: false,
            });
        });

        it('detects gas / funds errors', () => {
            const result = parseContractError({ message: 'out of gas' });
            expect(result.message).toBe(
                '⛽ Transaction ran out of gas. Please try again with more gas.',
            );
            expect(result.isContractError).toBe(false);
        });

        it('returns a generic failure for unrecognized errors', () => {
            const result = parseContractError({ message: 'something weird happened' });
            expect(result).toEqual({
                message: 'Transaction failed. Please try again.',
                isUserRejection: false,
                isContractError: false,
            });
        });
    });

    describe('input shapes', () => {
        it('handles a plain string error', () => {
            expect(parseContractError('User rejected').isUserRejection).toBe(true);
        });

        it('handles null / undefined without throwing', () => {
            expect(parseContractError(null).message).toBe('Transaction failed. Please try again.');
            expect(parseContractError(undefined).message).toBe(
                'Transaction failed. Please try again.',
            );
        });
    });
});
