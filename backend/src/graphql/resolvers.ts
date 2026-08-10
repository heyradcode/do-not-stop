import { findReadyOpponents, getAllPets, getPetById, searchPets, type RosterPet } from '@repositories/roster.repository';
import { findBattleProgress, withBattleProgress } from '@repositories/battleProgress.overlay';
import {
    findPetLeaderboard,
    findPlayerLeaderboard,
    findPlayerRank,
} from '@repositories/leaderboard.repository';
import { tryGrpcEstimateWin } from '@grpc-client/estimateWin';
import {
    getCatalog,
    getInventory,
    getPendingItems,
    getPetEquipment,
    getPetEquipmentForPets,
    type ItemView,
} from '@features/inventory';
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
    /** Substring filter; ranks stay absolute, so it narrows the board without renumbering it. */
    search?: string | null;
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

interface PetEquipmentArgs {
    chain: string;
    petId: string;
}

interface PetEquipmentForPetsArgs {
    chain: string;
    petIds: string[];
}

export interface GraphQLContext {
    /** Authenticated wallet address; empty string when unauthenticated. */
    caller: string;
}

/**
 * Project an `ItemView` to the GraphQL `ItemDefinition` shape.
 *
 * The effect is serialized to a JSON string rather than exposed as a typed union. The
 * payload shape differs per category and gains a variant each time a new effect kind
 * lands, so a union would need a schema change for a value the client only ever renders.
 * Null stays null, so "inert item" and "unreadable payload" both read as absence, which
 * is what they mean to a client either way.
 */
function toItemDefinition(item: ItemView) {
    return { ...item, effect: item.effect ? JSON.stringify(item.effect) : null };
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

        const { rows, total, emptyReason } = await findReadyOpponents({
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
            // Null whenever there is anything to show. Present only to let the client say
            // which of four very different situations produced an empty picker, since they
            // are indistinguishable to a player and only some are theirs to fix.
            emptyReason: emptyReason ?? null,
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
        const { entries, total } = await findPetLeaderboard({
            chain: args.chain,
            page,
            pageSize,
            search: args.search ?? undefined,
        });

        return {
            entries: entries.map(({ petId: id, ...rest }) => ({ id, ...rest })),
            total,
            page,
            pageSize,
        };
    },

    playerLeaderboard: async (args: LeaderboardArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        const page = Math.max(0, args.page ?? 0);
        const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, args.pageSize ?? DEFAULT_PAGE_SIZE));
        const { entries, total } = await findPlayerLeaderboard({
            chain: args.chain,
            page,
            pageSize,
            search: args.search ?? undefined,
        });

        return { entries, total, page, pageSize };
    },

    playerRank: async (args: { chain: string }, context: GraphQLContext) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        // The session address, already normalized the way the board groups owners. An
        // unauthenticated caller has no standing to report rather than an error.
        return findPlayerRank(args.chain, context.caller);
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

    itemCatalog: async () => (await getCatalog()).map(toItemDefinition),

    inventory: async (args: { chain: string }, context: GraphQLContext) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        // An unauthenticated caller owns nothing rather than erroring, matching how
        // `playerRank` treats having no standing. The address is never an argument, so
        // there is no spelling of this query that reads someone else's bag.
        if (!context.caller) {
            return [];
        }
        return (await getInventory(args.chain, context.caller)).map((entry) => ({
            item: toItemDefinition(entry.item),
            quantity: entry.quantity,
        }));
    },

    pendingItems: async (args: { chain: string }, context: GraphQLContext) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        // Same rule as `inventory`: an unauthenticated caller has nothing waiting rather
        // than an error, and the owner is never an argument.
        if (!context.caller) {
            return [];
        }
        return (await getPendingItems(args.chain, context.caller)).map((pending) => ({
            ...pending,
            item: toItemDefinition(pending.item),
        }));
    },

    petEquipment: async (args: PetEquipmentArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        return (await getPetEquipment(args.chain, args.petId)).map((equipped) => ({
            slot: equipped.slot,
            item: toItemDefinition(equipped.item),
        }));
    },

    petEquipmentForPets: async (args: PetEquipmentForPetsArgs) => {
        if (!isSupportedChain(args.chain)) {
            throw new Error(`chain must be one of: ${SUPPORTED_CHAINS.join(', ')}`);
        }

        // Bounded like battleProgress, and against the same thing: one call must not be
        // able to ask for every pet in the table.
        const petIds = args.petIds.slice(0, MAX_PROGRESS_PET_IDS);
        const groups = await getPetEquipmentForPets(args.chain, petIds);

        return groups.map((group) => ({
            petId: group.petId,
            equipped: group.equipped.map((equipped) => ({
                slot: equipped.slot,
                item: toItemDefinition(equipped.item),
            })),
        }));
    },
};
