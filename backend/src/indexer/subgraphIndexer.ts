import { upsertPet } from './rosterRepository';

/**
 * Alternative EVM roster source: a subgraph (The Graph) instead of polling RPC.
 * See PVP_BATTLE.md §2.bis. Queries the subgraph's GraphQL `pets` collection and
 * upserts into the same `pet_roster` table, so the matchmaking endpoint and the
 * frontend are unchanged.
 *
 * To use instead of (or alongside) the RPC poller, wire it into the runner in
 * `index.ts`: read `SUBGRAPH_URL` from env and call `scanSubgraphRoster` for EVM.
 *
 * Schema mirrors `contracts/ethereum/subgraph/schema.graphql`.
 */
export interface SubgraphIndexerConfig {
    /** Subgraph GraphQL query endpoint. */
    url: string;
    /** Page size; The Graph caps `first` at 1000. */
    pageSize?: number;
}

interface SubgraphPet {
    id: string;
    owner: string;
    name: string;
    dna: string; // BigInt serialized as string
    level: number;
    rarity: number;
    winCount: number;
    lossCount: number;
    readyAt: string; // BigInt serialized as string
}

interface GraphQLResponse {
    data?: { pets: SubgraphPet[] };
    errors?: { message: string }[];
}

// Cursor pagination via `id_gt` (stable; avoids The Graph's skip ceiling).
// Ordering and filtering both use the ID's lexicographic order, so every pet is
// visited exactly once even though token ids are numeric strings.
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
            throw new Error(`subgraph request failed: HTTP ${res.status}`);
        }

        const json = (await res.json()) as GraphQLResponse;
        if (json.errors?.length) {
            throw new Error(`subgraph errors: ${json.errors.map((e) => e.message).join('; ')}`);
        }

        const pets = json.data?.pets ?? [];
        if (pets.length === 0) {
            break;
        }

        for (const pet of pets) {
            await upsertPet({
                chain: 'evm',
                petId: pet.id,
                owner: pet.owner.toLowerCase(),
                name: pet.name,
                level: pet.level,
                rarity: pet.rarity,
                dna: pet.dna,
                winCount: pet.winCount,
                lossCount: pet.lossCount,
                readyAt: BigInt(pet.readyAt),
            });
            scanned++;
            lastId = pet.id; // advance the cursor; last assignment wins
        }

        if (pets.length < pageSize) {
            break; // last page
        }
    }

    return { scanned };
}
