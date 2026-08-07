import { normalizeAccount } from '@shared/core';

/**
 * `0x1234…abcd` — a full address does not fit the columns it is displayed in.
 *
 * One definition because the app should not show two address formats; it was previously
 * copied into the battle panel, the leaderboard and the chat thread list.
 */
export const shortAddress = (address: string): string =>
    address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

/**
 * Whether two wallet addresses are the same account.
 *
 * Uses the protocol's own normalization rather than `toLowerCase()`, so it needs no chain
 * argument and cannot merge accounts: EVM addresses are case-insensitive and fold, while
 * base58 Solana pubkeys are case-*sensitive* and must not — two distinct pubkeys can
 * differ only in case.
 */
export const sameAccount = (a: string, b: string): boolean =>
    Boolean(a) && Boolean(b) && normalizeAccount(a) === normalizeAccount(b);
