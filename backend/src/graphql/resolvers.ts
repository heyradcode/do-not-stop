import { findReadyOpponents } from '@repositories/roster.repository';
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

export interface GraphQLContext {
    /** Authenticated wallet address; empty string when unauthenticated. */
    caller: string;
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
            opponents: rows.map(({ petId: id, readyAt, breedReadyAt, trainReadyAt, ...rest }) => ({
                id,
                ...rest,
                // GraphQL Float can't take bigint — coerce the unix-seconds cooldowns.
                readyAt: Number(readyAt),
                breedReadyAt: Number(breedReadyAt),
                trainReadyAt: Number(trainReadyAt),
            })),
            total,
            page,
            pageSize,
        };
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
