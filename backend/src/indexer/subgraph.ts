import { upsertPet } from '@repositories/roster.repository';
import type { Chain } from '@typings/chain';

/**
 * Roster source: the EVM subgraph on The Graph. Queries its GraphQL `pets`
 * collection and upserts into `pet_roster`. (Solana is indexed via Helius — see
 * indexing/solana.)
 *
 * Subgraph schema lives under `backend/indexing/evm/schema.graphql`.
 */
export interface SubgraphIndexerConfig {
    chain: Chain;
    /** Subgraph GraphQL query endpoint (Studio or decentralized network). */
    url: string;
    /** Page size; The Graph caps `first` at 1000. */
    pageSize?: number;
}

interface SubgraphPet {
    id: string;
    owner: string;
    name: string;
    dna: string;
    level: number;
    rarity: number;
    winCount: number;
    lossCount: number;
    readyAt: string;
}

interface GraphQLResponse {
    data?: { pets: SubgraphPet[] };
    errors?: { message: string }[];
}

const PETS_QUERY = `
  query Pets($first: Int!, $lastId: ID!) {
    pets(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
      id
      owner
      name
      dna
      level
      rarity
      winCount
      lossCount
      readyAt
    }
  }
`;

const DEFAULT_PAGE_SIZE = 1000;

function normalizeOwner(chain: Chain, owner: string): string {
    return chain === 'evm' ? owner.toLowerCase() : owner;
}

export async function scanSubgraphRoster(
    config: SubgraphIndexerConfig
): Promise<{ scanned: number }> {
    const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
    let lastId = '';
    let scanned = 0;

    for (;;) {
        const res = await fetch(config.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: PETS_QUERY,
                variables: { first: pageSize, lastId },
            }),
        });

        if (!res.ok) {
            throw new Error(
                `${config.chain} subgraph request failed: HTTP ${res.status}`
            );
        }

        const json = (await res.json()) as GraphQLResponse;
        if (json.errors?.length) {
            throw new Error(
                `${config.chain} subgraph errors: ${json.errors.map((e) => e.message).join('; ')}`
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
                owner: normalizeOwner(config.chain, pet.owner),
                name: pet.name,
                level: pet.level,
                rarity: pet.rarity,
                dna: pet.dna,
                winCount: pet.winCount,
                lossCount: pet.lossCount,
                readyAt: BigInt(pet.readyAt),
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
