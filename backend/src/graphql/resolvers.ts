import { findReadyOpponents, getAllPets, getPetById, searchPets, type RosterPet } from '@repositories/roster.repository';
import { findBattleProgress, withBattleProgress } from '@repositories/battleProgress.overlay';
import { findPetLeaderboard } from '@repositories/leaderboard.repository';
import { tryGrpcEstimateWin } from '@grpc-client/estimateWin';
import { isSupportedChain, SUPPORTED_CHAINS } from '@typings/chain';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
/** Upper bound on pet ids per battleProgress call. */
const MAX_PROGRESS_PET_IDS = 200;
/** Upper bound on requested sim seeds — keeps a single call from pinning indexer-go. */
const MAX_WIN_SAMPLES = 10_000;

interface OpponentsArgs {
    chain: string;
    minLevel?: number | null;
    page?: number | null;
    pageSize?: number | null;
}

interface LeaderboardArgs {
    chain: string;
    page?: number | null;
    pageSize?: number | null;
}

interface BattleProgressArgs {
    chain: string;
    petIds: string[];
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

interface AllPetsArgs {
    chain: string;
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

        // No overlay here: unlike the other pet reads, `findReadyOpponents` filters, bands
        // and orders on level and cooldown, so it merges progression in the query itself.
        return {
            opponents: rows.map(toOpponentPet),
            total,
            page,
            pageSize,
        };
    },

    leaderboard: async (args: LeaderboardArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        const page = Math.max(0, args.page ?? 0);
        const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, args.pageSize ?? DEFAULT_PAGE_SIZE));

        // No overlay here, for the same reason as `opponents`: the ranking is the merge,
        // so `findPetLeaderboard` does it in the query.
        const { entries, total } = await findPetLeaderboard({ chain: args.chain, page, pageSize });

        return {
            entries: entries.map(({ petId: id, ...rest }) => ({ id, ...rest })),
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
        return (await withBattleProgress(args.chain, rows)).map(toOpponentPet);
    },

    allPets: async (args: AllPetsArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }
        const limit = Math.min(500, Math.max(1, args.limit ?? 200));
        const rows = await getAllPets(args.chain, limit);
        return (await withBattleProgress(args.chain, rows)).map(toOpponentPet);
    },

    pet: async (args: PetArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        const row = await getPetById(args.chain, args.id);
        if (!row) return null;
        const [overlaid] = await withBattleProgress(args.chain, [row]);
        return toOpponentPet(overlaid ?? row);
    },

    battleProgress: async (args: BattleProgressArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        // Bounded so one call cannot ask for the whole table. A player's own roster is
        // far below this; anything larger is not a pet list.
        const petIds = args.petIds.slice(0, MAX_PROGRESS_PET_IDS);
        const rows = await findBattleProgress(args.chain, petIds);

        return rows.map(({ petId: id, readyAt, ...rest }) => ({
            id,
            ...rest,
            readyAt: Number(readyAt),
        }));
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
