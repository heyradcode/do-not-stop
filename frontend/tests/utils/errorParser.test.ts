import { describe, expect, it } from 'vitest';

import { parseContractError } from '../../src/utils/errorParser';

describe('parseContractError', () => {
    describe('user rejection', () => {
        it.each([
            'User rejected the request',
            'User denied transaction signature',
            'MetaMask Tx Signature: User rejected',
            'request rejected by user',
        ])('flags %j as a user rejection', (message) => {
            const result = parseContractError(new Error(message));

            expect(result).toEqual({
                message: 'Transaction cancelled by user',
                isUserRejection: true,
                isContractError: false,
            });
        });
    });

    describe('contract reverts', () => {
        it('maps the "already have a pet" revert to a friendly message', () => {
            const result = parseContractError(
                new Error('execution reverted: You already have a zombie'),
            );

            expect(result.isContractError).toBe(true);
            expect(result.isUserRejection).toBe(false);
            expect(result.message).toBe(
                'You already have a pet! Create a new one by breeding or battling.',
            );
        });

        it('maps unauthorized / not-the-owner reverts', () => {
            const result = parseContractError(
                new Error('execution reverted: caller is not the owner'),
            );

            expect(result.message).toBe('You are not authorized to perform this action.');
        });

        it('maps insufficient-funds reverts surfaced through a revert reason', () => {
            const result = parseContractError(
                new Error('execution reverted: insufficient funds for transfer'),
            );

            expect(result.message).toBe('Insufficient funds for this transaction.');
        });

        it('maps gas reverts surfaced through a revert reason', () => {
            const result = parseContractError(
                new Error('execution reverted: transaction ran out of gas'),
            );

            expect(result.message).toBe(
                'Transaction ran out of gas. Please try again with more gas.',
            );
        });

        it('extracts the viem-style revert reason and strips the trailing call info', () => {
            const result = parseContractError(
                new Error(
                    'reverted with the following reason: Pet is not ready yet Contract Call: address 0x123',
                ),
            );

            // No friendly mapping matches, so the extracted reason is returned verbatim.
            expect(result.isContractError).toBe(true);
            expect(result.message).toBe('Pet is not ready yet');
        });

        it('extracts the bare "revert <reason>" format (no "execution" prefix)', () => {
            const result = parseContractError(new Error('Error: revert Pet is busy'));

            expect(result.isContractError).toBe(true);
            expect(result.message).toBe('Pet is busy');
        });

        it('falls back to a generic contract message for unmapped rpc reverts', () => {
            const result = parseContractError(
                new Error('Internal JSON-RPC error. execution reverted'),
            );

            expect(result.message).toBe(
                'Transaction failed. This might be due to contract rules or insufficient gas.',
            );
        });
    });

    describe('network errors', () => {
        it.each(['network request failed', 'connection lost', 'request timeout'])(
            'classifies %j as a network error',
            (message) => {
                const result = parseContractError(new Error(message));

                expect(result).toEqual({
                    message: 'Network error. Please check your connection and try again.',
                    isUserRejection: false,
                    isContractError: false,
                });
            },
        );
    });

    describe('gas errors (top-level, no revert)', () => {
        it.each(['out of gas', 'gas required exceeds allowance', 'insufficient funds'])(
            'classifies %j as a gas error',
            (message) => {
                const result = parseContractError(new Error(message));

                expect(result.message).toBe(
                    'Transaction ran out of gas. Please try again with more gas.',
                );
            },
        );
    });

    describe('fallbacks', () => {
        it('returns the generic message for unrecognised errors', () => {
            const result = parseContractError(new Error('something weird happened'));

            expect(result).toEqual({
                message: 'Transaction failed. Please try again.',
                isUserRejection: false,
                isContractError: false,
            });
        });

        it('handles a plain string error via toString()', () => {
            const result = parseContractError('User rejected the request');

            expect(result.isUserRejection).toBe(true);
        });

        it('handles a null/undefined error without throwing', () => {
            const result = parseContractError(undefined);

            expect(result.message).toBe('Transaction failed. Please try again.');
        });
    });
});