import { useQuery } from '@tanstack/react-query';
import type { PublicKey } from '@solana/web3.js';
import { PET_ACCOUNT_OWNER_MEMCMP_OFFSET } from '../../../utils/solana/constants';
import { getAccountClient } from '../../../utils/solana/accountClient';
import { useProgram } from './useProgram';

export type PetRow = {
    publicKey: PublicKey;
    account: Record<string, unknown>;
};

export const usePets = (owner: PublicKey | null) => {
    const { program, programId, isReady } = useProgram();

    return useQuery({
        queryKey: ['cryptopets', 'pets', programId?.toBase58() ?? 'none', owner?.toBase58() ?? 'none'],
        enabled: Boolean(isReady && program && programId && owner),
        queryFn: async (): Promise<PetRow[]> => {
            const rows = await getAccountClient(program!, 'petAccount').all([
                {
                    memcmp: {
                        offset: PET_ACCOUNT_OWNER_MEMCMP_OFFSET,
                        bytes: owner!.toBase58(),
                    },
                },
            ]);
            return rows as PetRow[];
        },
    });
};
