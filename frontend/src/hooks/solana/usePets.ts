import { useQuery } from '@tanstack/react-query';
import type { PublicKey } from '@solana/web3.js';
import { useProgram } from './useProgram';

/** 8-byte discriminator + 4-byte `id` field before `owner` in `PetAccount`. */
const PET_OWNER_MEMCMP_OFFSET = 12;

export type PetRow = {
    publicKey: PublicKey;
    account: Record<string, unknown>;
};

export function usePets(owner: PublicKey | null) {
    const { program, programId, isReady } = useProgram();

    return useQuery({
        queryKey: ['cryptopets', 'pets', programId?.toBase58() ?? 'none', owner?.toBase58() ?? 'none'],
        enabled: Boolean(isReady && program && programId && owner),
        queryFn: async (): Promise<PetRow[]> => {
            const acc = program!.account as Record<string, { all: (f?: unknown) => Promise<PetRow[]> }>;
            const ns = acc.petAccount ?? acc.pet ?? acc.PetAccount;
            if (!ns?.all) {
                throw new Error('IDL has no pet account client (expected petAccount)');
            }
            return ns.all([
                {
                    memcmp: {
                        offset: PET_OWNER_MEMCMP_OFFSET,
                        bytes: owner!.toBase58(),
                    },
                },
            ]);
        },
    });
}
