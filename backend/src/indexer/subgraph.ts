import { upsertPet } from '@repositories/roster.repository';
import type { Chain } from '@typings/chain';

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

async function upsertPage(chain: Chain, pets: SubgraphPet[]): Promise<bigint> {
    let maxUpdatedAt = BigInt(0);
    for (const pet of pets) {
        await upsertPet({
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
        });
        const ts = BigInt(pet.updatedAt);
        if (ts > maxUpdatedAt) maxUpdatedAt = ts;
    }
    return maxUpdatedAt;
}

/**
 * Full sync — fetches every pet ordered by id. Used on startup.
 * Returns the highest `updatedAt` seen, used as the watermark for incremental syncs.
 */
export async function scanSubgraphRoster(
    config: SubgraphIndexerConfig,
): Promise<{ scanned: number; maxUpdatedAt: bigint }> {
    const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
    let lastId = '';
    let scanned = 0;
    let maxUpdatedAt = BigInt(0);

    for (;;) {
        const pets = await fetchPage(config.url, FULL_SYNC_QUERY, { first: pageSize, lastId });
        if (pets.length === 0) break;

        const pageMax = await upsertPage(config.chain, pets);
        if (pageMax > maxUpdatedAt) maxUpdatedAt = pageMax;

        scanned += pets.length;
        lastId = pets[pets.length - 1]?.id ?? lastId;
        if (pets.length < pageSize) break;
    }

    return { scanned, maxUpdatedAt };
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
    let lastId = '';
    let synced = 0;
    let maxUpdatedAt = sinceUpdatedAt;

    for (;;) {
        const pets = await fetchPage(config.url, INCREMENTAL_QUERY, {
            first: pageSize,
            lastId,
            since: sinceUpdatedAt.toString(),
        });
        if (pets.length === 0) break;

        const pageMax = await upsertPage(config.chain, pets);
        if (pageMax > maxUpdatedAt) maxUpdatedAt = pageMax;

        synced += pets.length;
        lastId = pets[pets.length - 1]?.id ?? lastId;
        if (pets.length < pageSize) break;
    }

    return { synced, maxUpdatedAt };
}
