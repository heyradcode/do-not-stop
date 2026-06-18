import { findReadyOpponents, getPetById, searchPets, type RosterPet } from '@repositories/roster.repository';
import { tryGrpcEstimateWin } from '../grpc/estimateWin';
import { isSupportedChain, SUPPORTED_CHAINS } from '@typings/chain';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
/** Upper bound on requested sim seeds — keeps a single call from pinning indexer-go. */
const MAX_WIN_SAMPLES = 10_000;

interface OpponentsArgs {
    chain: string;
    minLevel?: number | null;
    page?: number | null;
    pageSize?: number | null;
}

interface WinEstimateArgs {
    chain: string;
    petId1: string;
    petId2: string;
    samples?: number | null;
}

interface PetArgs {
    chain: string;
    id: string;
}

interface SearchPetsArgs {
    chain: string;
    query: string;
    limit?: number | null;
}

export interface GraphQLContext {
    /** Authenticated wallet address; empty string when unauthenticated. */
    caller: string;
}

/**
 * Project a RosterPet to the GraphQL `OpponentPet` shape: rename `petId` → `id`
 * and coerce the bigint unix-seconds cooldowns to Float (GraphQL has no bigint).
 * Shared by the opponents list and the single-pet detail read so both stay in
 * lockstep.
 */
function toOpponentPet({ petId: id, readyAt, breedReadyAt, trainReadyAt, ...rest }: RosterPet) {
    return {
        id,
        ...rest,
        readyAt: Number(readyAt),
        breedReadyAt: Number(breedReadyAt),
        trainReadyAt: Number(trainReadyAt),
    };
}

export const rootValue = {
    opponents: async (args: OpponentsArgs, context: GraphQLContext) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        const page = Math.max(0, args.page ?? 0);
        const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, args.pageSize ?? DEFAULT_PAGE_SIZE));
        const minLevel = Math.max(0, args.minLevel ?? 0);

        const { rows, total } = await findReadyOpponents({
            chain: args.chain,
            excludeOwner: context.caller,
            minLevel,
            page,
            pageSize,
        });

        return {
            opponents: rows.map(toOpponentPet),
            total,
            page,
            pageSize,
        };
    },

    searchPets: async (args: SearchPetsArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        const limit = Math.min(20, Math.max(1, args.limit ?? 10));
        const rows = await searchPets({ chain: args.chain, query: args.query, limit });
        return rows.map(toOpponentPet);
    },

    pet: async (args: PetArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        const row = await getPetById(args.chain, args.id);
        return row ? toOpponentPet(row) : null;
    },

    winEstimate: async (args: WinEstimateArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        // Null (estimate unavailable) is a valid result, not an error — the
        // fail-open client already maps every fault to null.
        return tryGrpcEstimateWin({
            chain: args.chain,
            petId1: args.petId1,
            petId2: args.petId2,
            ...(args.samples != null && {
                samples: Math.min(MAX_WIN_SAMPLES, Math.max(0, args.samples)),
            }),
        });
    },
};
