import { Prisma } from '@generated/prisma/client';

import type { Chain } from '@typings/chain';

/**
 * The SQL expression that identifies a `pet_roster` owner, per chain.
 *
 * EVM addresses are folded to lowercase and base58 Solana pubkeys are left alone — the
 * same split `normalizeAccount` makes. Stated once here because it is security-relevant
 * in more than one place and was previously restated at three call sites: matchmaking's
 * consent match, the leaderboard's owner grouping, and chat's marriage gate.
 *
 * Both directions of getting it wrong are real. `owner` is written by indexer-go, which
 * is not guaranteed to match the case the JWT normalizes to, so an unfolded EVM
 * comparison misses rows that should match — listing one wallet twice on the player
 * board, or finding no marriage for someone who has one. Folding base58 does the
 * opposite damage: two distinct Solana pubkeys can differ only in case, so it can match
 * an account that is not the caller's.
 *
 * `alias` is the table alias the caller gave `pet_roster` in its own query.
 */
export function ownerKey(chain: Chain, alias: string): Prisma.Sql {
    const column = Prisma.raw(`${alias}.owner`);
    return chain === 'evm' ? Prisma.sql`LOWER(${column})` : Prisma.sql`${column}`;
}
