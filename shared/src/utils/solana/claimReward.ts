import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN, Program, type AnchorProvider } from '@coral-xyz/anchor';

import { TOKEN_PROGRAM_ID } from './constants';
import {
    associatedTokenAddress,
    claimedPda,
    rewardsStatePda,
    seasonPda,
    seasonVaultPda,
} from './pdas';

/**
 * Claiming a season reward on Solana (§I), against `cryptopets_rewards`.
 *
 * **This loads its own program, and that is the point.** Every other Solana writer here is
 * handed the `Program` from `useProgram`, which is built from the *pets* program's IDL and
 * bound to the pets program id. `cryptopets_rewards` is a different program at an address
 * that is not known until a season names it, so reusing that instance produced a call to
 * `.methods.claim` that does not exist on the pets IDL — and would have been addressed to the
 * wrong program even if it had. Taking a provider instead of a `Program` makes that
 * substitution unrepresentable rather than merely documented.
 *
 * The IDL is fetched from the distributor's own IDL account, so `new Program` picks the
 * address up from it and the instruction can only go to the program the season named.
 *
 * **Permissionless in who sends it, not in who is paid.** The leaf binds the beneficiary and
 * the program constrains the destination token account to that wallet, so anyone can pay the
 * fee to deliver someone else's reward and nobody can redirect it. That is why `payer` and
 * `wallet` are separate arguments rather than one.
 */

export type ClaimRewardArgs = {
    /** Signs and sends. The rewards program is loaded through this, not passed in. */
    provider: AnchorProvider;
    /** The `cryptopets_rewards` program id, from the season's `distributor`. */
    programId: PublicKey;
    /** Who signs and pays the fee, plus the nullifier account's rent. */
    payer: PublicKey;
    /** Who gets paid. The leaf binds this; it need not be the payer. */
    wallet: PublicKey;
    /** SPL mint the season pays in, from the season's `token`. */
    mint: PublicKey;
    seasonId: number;
    /** Amount in the mint's smallest unit, as a decimal string. */
    amount: string;
    /** Sibling hashes, `0x`-prefixed 32-byte hex, in the order the proof walks them. */
    proof: string[];
};

/** A 32-byte proof element as the program's `Vec<[u8; 32]>` expects it. */
const proofElement = (hex: string, index: number): number[] => {
    const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
        throw new Error(`proof[${index}] is not a 32-byte hex string: ${hex}`);
    }
    const bytes: number[] = [];
    for (let i = 0; i < 64; i += 2) {
        bytes.push(Number.parseInt(raw.slice(i, i + 2), 16));
    }
    return bytes;
};

export const claimRewardOnSolana = async (args: ClaimRewardArgs): Promise<string> => {
    const { provider, programId, payer, wallet, mint, seasonId, amount, proof } = args;

    const idl = await Program.fetchIdl(programId, provider);
    if (!idl) {
        throw new Error(
            `No IDL published for the reward distributor at ${programId.toBase58()}. ` +
                'Run `anchor idl init` for cryptopets_rewards, or point the season at a distributor that has one.',
        );
    }
    const program = new Program(idl, provider);

    const [rewards] = rewardsStatePda(programId);
    const [season] = seasonPda(programId, seasonId);
    const [vault] = seasonVaultPda(programId, seasonId);
    const [claimed] = claimedPda(programId, seasonId, wallet);
    // The beneficiary's associated account, not the payer's: the program refuses any
    // destination whose owner is not the wallet the leaf names, so a sponsor cannot
    // redirect the payout by passing their own.
    const [walletToken] = associatedTokenAddress(wallet, mint);

    return program.methods
        .claim!(seasonId, new BN(amount), proof.map(proofElement))
        .accounts({
            rewards,
            season,
            payer,
            wallet,
            claimed,
            vault,
            walletToken,
            tokenProgram: new PublicKey(TOKEN_PROGRAM_ID),
            systemProgram: SystemProgram.programId,
        })
        .rpc();
};
