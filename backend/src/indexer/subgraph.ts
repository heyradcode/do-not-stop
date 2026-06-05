import { upsertManyPets } from '@repositories/roster.repository';
import type { Chain } from '@typings/chain';
import type { RosterPet } from '@repositories/roster.repository';

export interface SubgraphIndexerConfig {
    chain: Chain;
    /** Subgraph HTTP query endpoint. */
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
    updatedAt: string;
}

interface GraphQLResponse {
    data?: { pets: SubgraphPet[] };
    errors?: { message: string }[];
}

const FULL_SYNC_QUERY = `
  query Pets($first: Int!, $lastId: ID!) {
    pets(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
      id owner name dna level rarity winCount lossCount readyAt updatedAt
    }
  }
`;

const INCREMENTAL_QUERY = `
  query PetsSince($first: Int!, $lastId: ID!, $since: BigInt!) {
    pets(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId, updatedAt_gt: $since }) {
      id owner name dna level rarity winCount lossCount readyAt updatedAt
    }
  }
`;

const DEFAULT_PAGE_SIZE = 1000;

function normalizeOwner(chain: Chain, owner: string): string {
    return chain === 'evm' ? owner.toLowerCase() : owner;
}

async function fetchPage(
    url: string,
    query: string,
    variables: Record<string, unknown>,
): Promise<SubgraphPet[]> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) throw new Error(`subgraph request failed: HTTP ${res.status}`);

    const json = (await res.json()) as GraphQLResponse;
    if (json.errors?.length) {
        throw new Error(`subgraph errors: ${json.errors.map((e) => e.message).join('; ')}`);
    }

    return json.data?.pets ?? [];
}

/** Cursor-paginate through all matching pets using the given query and variable builder. */
async function paginate(
    url: string,
    query: string,
    buildVars: (lastId: string) => Record<string, unknown>,
    pageSize: number,
): Promise<SubgraphPet[]> {
    let lastId = '';
    const all: SubgraphPet[] = [];

    for (;;) {
        const page = await fetchPage(url, query, buildVars(lastId));
        if (page.length === 0) break;
        all.push(...page);
        lastId = page[page.length - 1]?.id ?? lastId;
        if (page.length < pageSize) break;
    }

    return all;
}

async function upsertAll(chain: Chain, pets: SubgraphPet[]): Promise<bigint> {
    const rows: RosterPet[] = pets.map((pet) => ({
        chain,
        petId: pet.id,
        owner: normalizeOwner(chain, pet.owner),
        name: pet.name,
        level: pet.level,
        rarity: pet.rarity,
        dna: pet.dna,
        winCount: pet.winCount,
        lossCount: pet.lossCount,
        readyAt: BigInt(pet.readyAt),
    }));

    await upsertManyPets(rows);

    return pets.reduce((max, pet) => {
        const ts = BigInt(pet.updatedAt);
        return ts > max ? ts : max;
    }, BigInt(0));
}

/**
 * Full sync — fetches every pet ordered by id. Used on startup.
 * Returns the highest `updatedAt` seen, used as the watermark for incremental syncs.
 */
export async function scanSubgraphRoster(
    config: SubgraphIndexerConfig,
): Promise<{ scanned: number; maxUpdatedAt: bigint }> {
    const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
    const pets = await paginate(
        config.url,
        FULL_SYNC_QUERY,
        (lastId) => ({ first: pageSize, lastId }),
        pageSize,
    );
    const maxUpdatedAt = await upsertAll(config.chain, pets);
    return { scanned: pets.length, maxUpdatedAt };
}

/**
 * Incremental sync — fetches only pets updated since `sinceUpdatedAt`.
 * Cheap on idle periods (returns nothing); only upserts what actually changed.
 */
export async function syncSubgraphChanges(
    config: SubgraphIndexerConfig,
    sinceUpdatedAt: bigint,
): Promise<{ synced: number; maxUpdatedAt: bigint }> {
    const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
    const pets = await paginate(
        config.url,
        INCREMENTAL_QUERY,
        (lastId) => ({ first: pageSize, lastId, since: sinceUpdatedAt.toString() }),
        pageSize,
    );
    const maxUpdatedAt = pets.length > 0 ? await upsertAll(config.chain, pets) : sinceUpdatedAt;
    return { synced: pets.length, maxUpdatedAt };
}
