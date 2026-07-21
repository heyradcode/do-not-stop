import { useQuery } from '@tanstack/react-query';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { globalStatePda, playerProfilePda } from '../../../utils/solana/pdas';
import { getAccountClient } from '../../../utils/solana/accountClient';
import { useProgram } from './useProgram';

export interface SolanaFees {
    /** GlobalState.base_mint_fee_lamports — base gacha mint fee before per-wallet escalation. */
    baseMintFeeLamports?: bigint;
    /** GlobalState.level_up_fee_lamports — base level-up fee (not level-scaled in this hook). */
    levelUpFeeLamports?: bigint;
    /** GlobalState.breed_fee_lamports — same-owner breed fee. */
    breedFeeLamports?: bigint;
    /** GlobalState.battle_fee_lamports — funds the settle keeper's settle_battle tx. */
    battleFeeLamports?: bigint;
    /** GlobalState.train_fee_lamports — base train fee, level-scaled at call time. */
    trainFeeLamports?: bigint;
    /** GlobalState.stud_fee_lamports — added on top of breedFee for cross-owner breeding. */
    studFeeLamports?: bigint;
    /** PlayerProfile.mint_count — lifetime gacha mints from this wallet. */
    walletMintCount?: number;
    /** Next commit_mint fee: baseMintFeeLamports << min(walletMintCount, 7), mirrors on-chain escalation. */
    nextMintFeeLamports?: bigint;
}

/** Coerce an Anchor BN / number / string to bigint, returns undefined on failure. */
const toBigInt = (v: unknown): bigint | undefined => {
    if (v == null) return undefined;
    try { return BigInt(String(v)); } catch { return undefined; }
};

/**
 * Reads live fee values from the on-chain GlobalState PDA and the connected
 * wallet's PlayerProfile. Mirrors useEvmFees for Solana — consumers can use
 * either without knowing which chain is active.
 */
export const useSolanaFees = (enabled: boolean): SolanaFees => {
    const { signingWallet } = useSolanaAnchor();
    const { program, programId, isReady } = useProgram();
    const owner = enabled && signingWallet?.publicKey ? signingWallet.publicKey : null;

    const canQuery = enabled && isReady && Boolean(program && programId);

    const { data: gs } = useQuery({
        queryKey: ['cryptopets', 'globalState', programId?.toBase58() ?? 'none'],
        enabled: canQuery,
        queryFn: async () => {
            const [pda] = globalStatePda(programId!);
            return getAccountClient(program!, 'globalState').fetchNullable(pda) as Promise<Record<string, unknown> | null>;
        },
        staleTime: 60_000,
    });

    const { data: pp } = useQuery({
        queryKey: ['cryptopets', 'playerProfile', programId?.toBase58() ?? 'none', owner?.toBase58() ?? 'none'],
        enabled: canQuery && Boolean(owner),
        queryFn: async () => {
            const [pda] = playerProfilePda(programId!, owner!);
            return getAccountClient(program!, 'playerProfile').fetchNullable(pda) as Promise<Record<string, unknown> | null>;
        },
        staleTime: 30_000,
    });

    const baseMint = toBigInt(gs?.baseMintFeeLamports);
    const mintCount = pp?.mintCount != null ? Number(pp.mintCount) : 0;
    const nextMint = baseMint != null ? baseMint << BigInt(Math.min(mintCount, 7)) : undefined;

    return {
        baseMintFeeLamports: baseMint,
        levelUpFeeLamports:  toBigInt(gs?.levelUpFeeLamports),
        breedFeeLamports:    toBigInt(gs?.breedFeeLamports),
        battleFeeLamports:   toBigInt(gs?.battleFeeLamports),
        trainFeeLamports:    toBigInt(gs?.trainFeeLamports),
        studFeeLamports:     toBigInt(gs?.studFeeLamports),
        walletMintCount:     mintCount,
        nextMintFeeLamports: nextMint,
    };
};
