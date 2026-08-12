import { useQuery } from '@tanstack/react-query';
import type { PublicKey } from '@solana/web3.js';
import { PET_ACCOUNT_OWNER_MEMCMP_OFFSET } from '../../../utils/solana/constants';
import { getAccountClient } from '../../../utils/solana/accountClient';
import { useProgram } from './useProgram';

export type PetRow = {
    publicKey: PublicKey;
    account: Record<string, unknown>;
};

/**
 * A wallet's pets, found by filtering `getProgramAccounts` on `PetAccount.owner`.
 *
 * **That field is an index, not an authority, and it can be stale.** `state/pet.rs` says so
 * outright: a holder can transfer the Core asset straight through `mpl-core` without this
 * program seeing it, which leaves the pet listed under its previous owner until some
 * instruction rewrites the field. Nothing detects that — a Core asset lookup cannot answer
 * "every pet this wallet owns" in one call, which is why the denormalized column exists at
 * all.
 *
 * Two consequences worth knowing. A pet received by a direct transfer does not appear here
 * until an instruction rewrites `owner`; calling `transfer_pet` to yourself does it, since
 * that check reads the live asset owner. And a pet sent away this way keeps showing in the
 * old wallet's list, where acting on it fails with the program's `Unauthorized` — which
 * `formatSolanaActionError` renders as a stale-list message rather than a permission one,
 * because that is what it nearly always is.
 */
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
