import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { upsertPet } from '@repositories/roster.repository';
import type { Chain } from '@typings/chain';

export interface SubgraphIndexerConfig {
    chain: Chain;
    /** Subgraph HTTP query endpoint. */
    url: string;
    /** WebSocket endpoint — defaults to url with https→wss / http→ws. */
    wsUrl?: string;
    /** Page size for initial sync; The Graph caps `first` at 1000. */
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

const SYNC_QUERY = `
  query Pets($first: Int!, $lastId: ID!) {
    pets(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
      id owner name dna level rarity winCount lossCount readyAt updatedAt
    }
  }
`;

const SUBSCRIPTION_QUERY = `
  subscription OnPetsUpdated {
    pets(orderBy: updatedAt, orderDirection: desc, first: 1000) {
      id owner name dna level rarity winCount lossCount readyAt updatedAt
    }
  }
`;

const DEFAULT_PAGE_SIZE = 1000;

function normalizeOwner(chain: Chain, owner: string): string {
    return chain === 'evm' ? owner.toLowerCase() : owner;
}

function toWsUrl(httpUrl: string): string {
    return httpUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
}

async function upsertSubgraphPet(chain: Chain, pet: SubgraphPet): Promise<void> {
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
}

/**
 * One-time full sync via HTTP — used on startup and by the CLI.
 * Returns the highest `updatedAt` seen so the subscription can skip already-synced pets.
 */
export async function scanSubgraphRoster(
    config: SubgraphIndexerConfig
): Promise<{ scanned: number; maxUpdatedAt: bigint }> {
    const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
    let lastId = '';
    let scanned = 0;
    let maxUpdatedAt = BigInt(0);

    for (;;) {
        const res = await fetch(config.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: SYNC_QUERY, variables: { first: pageSize, lastId } }),
        });

        if (!res.ok) {
            throw new Error(`${config.chain} subgraph request failed: HTTP ${res.status}`);
        }

        const json = (await res.json()) as GraphQLResponse;
        if (json.errors?.length) {
            throw new Error(`${config.chain} subgraph errors: ${json.errors.map((e) => e.message).join('; ')}`);
        }

        const pets = json.data?.pets ?? [];
        if (pets.length === 0) break;

        for (const pet of pets) {
            await upsertSubgraphPet(config.chain, pet);
            scanned++;
            lastId = pet.id;
            const ts = BigInt(pet.updatedAt);
            if (ts > maxUpdatedAt) maxUpdatedAt = ts;
        }

        if (pets.length < pageSize) break;
    }

    return { scanned, maxUpdatedAt };
}

/**
 * Long-running WebSocket subscription — receives pushed updates from the subgraph
 * whenever pets change on-chain, replacing the polling interval for EVM.
 *
 * Only processes pets with `updatedAt > sinceUpdatedAt` to skip already-synced data.
 * Returns an `unsubscribe` function; call it to tear down the connection.
 */
export function subscribeSubgraphRoster(
    config: SubgraphIndexerConfig,
    sinceUpdatedAt: bigint,
): () => void {
    const wsUrl = config.wsUrl ?? toWsUrl(config.url);
    let lastUpdatedAt = sinceUpdatedAt;

    const client = createClient({
        url: wsUrl,
        webSocketImpl: WebSocket,
        retryAttempts: Infinity,
        shouldRetry: () => true,
        on: {
            connected: () => console.log(`[indexer] ${config.chain} subgraph subscription connected`),
            closed: () => console.log(`[indexer] ${config.chain} subgraph subscription closed`),
            error: (err: unknown) => console.error(`[indexer] ${config.chain} subgraph WS error:`, err),
        },
    });

    const unsubscribe = client.subscribe<{ pets: SubgraphPet[] }>(
        { query: SUBSCRIPTION_QUERY },
        {
            next: ({ data }: { data?: { pets: SubgraphPet[] } | null }) => {
                const pets = data?.pets ?? [];
                const fresh = pets.filter((p: SubgraphPet) => BigInt(p.updatedAt) > lastUpdatedAt);
                if (fresh.length === 0) return;

                void (async () => {
                    for (const pet of fresh) {
                        await upsertSubgraphPet(config.chain, pet);
                        const ts = BigInt(pet.updatedAt);
                        if (ts > lastUpdatedAt) lastUpdatedAt = ts;
                    }
                    console.log(`[indexer] ${config.chain} subscription: synced ${fresh.length} pet(s)`);
                })();
            },
            error: (err: unknown) => console.error(`[indexer] ${config.chain} subscription error:`, err),
            complete: () => console.log(`[indexer] ${config.chain} subscription ended`),
        },
    );

    return () => {
        unsubscribe();
        void client.dispose();
    };
}
