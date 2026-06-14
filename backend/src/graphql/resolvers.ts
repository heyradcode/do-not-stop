import { findReadyOpponents } from '@repositories/roster.repository';
import { isSupportedChain, SUPPORTED_CHAINS } from '@typings/chain';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface OpponentsArgs {
    chain: string;
    minLevel?: number | null;
    page?: number | null;
    pageSize?: number | null;
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
};
