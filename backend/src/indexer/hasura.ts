import { upsertPet } from '@repositories/roster.repository';
import type { Chain } from '@typings/chain';

/**
 * Roster source: Hasura GraphQL over the substreams-sink-sql Postgres table
 * (`solana.pet`). Replaces the Solana subgraph — Substreams writes the table,
 * Hasura auto-generates this GraphQL API, and we poll it like a subgraph.
 *
 * Schema/pipeline live under `backend/graph/solana/{substreams,sink}`.
 */
export interface HasuraIndexerConfig {
    chain: Chain;
    /** Hasura GraphQL endpoint, e.g. http://localhost:8080/v1/graphql */
    url: string;
    /** Sent as x-hasura-admin-secret. */
    adminSecret?: string;
    /** Page size for keyset pagination over id. */
    pageSize?: number;
}

// Column names come straight from solana.pet (snake_case); bigint columns
// (ready_at) are serialized by Hasura as strings.
interface HasuraPet {
    id: string;
    owner: string;
    name: string;
    dna: string;
    level: number;
    rarity: number;
    win_count: number;
    loss_count: number;
    ready_at: string;
}

interface GraphQLResponse {
    data?: { pets: HasuraPet[] };
    errors?: { message: string }[];
}

// Hasura's dialect (vs The Graph's): `_gt` filter, `order_by`, `limit`.
const PETS_QUERY = `
  query Pets($limit: Int!, $lastId: String!) {
    pets(limit: $limit, order_by: { id: asc }, where: { id: { _gt: $lastId } }) {
      id
      owner
      name
      dna
      level
      rarity
      win_count
      loss_count
      ready_at
    }
  }
`;

const DEFAULT_PAGE_SIZE = 1000;

export async function scanHasuraRoster(
    config: HasuraIndexerConfig
): Promise<{ scanned: number }> {
    const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
    let lastId = '';
    let scanned = 0;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.adminSecret) {
        headers['x-hasura-admin-secret'] = config.adminSecret;
    }

    for (;;) {
        const res = await fetch(config.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: PETS_QUERY,
                variables: { limit: pageSize, lastId },
            }),
        });

        if (!res.ok) {
            throw new Error(
                `${config.chain} hasura request failed: HTTP ${res.status}`
            );
        }

        const json = (await res.json()) as GraphQLResponse;
        if (json.errors?.length) {
            throw new Error(
                `${config.chain} hasura errors: ${json.errors.map((e) => e.message).join('; ')}`
            );
        }

        const pets = json.data?.pets ?? [];
        if (pets.length === 0) {
            break;
        }

        for (const pet of pets) {
            await upsertPet({
                chain: config.chain,
                petId: pet.id,
                owner: pet.owner,
                name: pet.name,
                level: pet.level,
                rarity: pet.rarity,
                dna: pet.dna,
                winCount: pet.win_count,
                lossCount: pet.loss_count,
                readyAt: BigInt(pet.ready_at),
            });
            scanned++;
            lastId = pet.id;
        }

        if (pets.length < pageSize) {
            break;
        }
    }

    return { scanned };
}
