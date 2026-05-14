import { useQuery } from '@tanstack/react-query';
import { globalStatePda } from '../../utils/solana/pdas';
import { useProgram } from './useProgram';

export function useGlobalState() {
    const { program, programId, isReady } = useProgram();

    const globalPk = program && programId ? globalStatePda(programId)[0] : null;

    return useQuery({
        queryKey: ['cryptopets', 'globalState', programId?.toBase58() ?? 'none', globalPk?.toBase58() ?? 'none'],
        enabled: Boolean(isReady && program && globalPk),
        queryFn: async () => {
            const acc = program!.account as Record<string, { fetchNullable: (k: unknown) => Promise<unknown> }>;
            const ns = acc.globalState ?? acc.GlobalState;
            if (!ns?.fetchNullable) {
                throw new Error('IDL has no globalState account client');
            }
            return ns.fetchNullable(globalPk!);
        },
    });
}
