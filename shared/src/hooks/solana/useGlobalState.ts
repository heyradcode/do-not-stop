import { useQuery } from '@tanstack/react-query';
import { globalStatePda } from '../../utils/solana/pdas';
import { getAccountClient } from '../../utils/solana/accountClient';
import { useProgram } from './useProgram';

export function useGlobalState() {
    const { program, programId, isReady } = useProgram();

    const globalPk = program && programId ? globalStatePda(programId)[0] : null;

    return useQuery({
        queryKey: ['cryptopets', 'globalState', programId?.toBase58() ?? 'none', globalPk?.toBase58() ?? 'none'],
        enabled: Boolean(isReady && program && globalPk),
        queryFn: () => getAccountClient(program!, 'globalState').fetchNullable(globalPk!),
    });
}
