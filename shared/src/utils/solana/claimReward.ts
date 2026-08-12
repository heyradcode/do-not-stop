import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN, type Idl, type Program } from '@coral-xyz/anchor';

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
 * `program.methods.<name>!(...)`: `Program<Idl>` makes `.methods` an index signature, so
 * consumers with `noUncheckedIndexedAccess` see every property as possibly undefined. The
 * instruction exists on whichever program's IDL was fetched — asserted, not defensively
 * checked, matching the other Solana writers here.
 *
 * **Permissionless in who sends it, not in who is paid.** The leaf binds the beneficiary and
 * the program constrains the destination token account to that wallet, so anyone can pay the
 * fee to deliver someone else's reward and nobody can redirect it. That is why `payer` and
 * `wallet` are separate arguments rather than one.
 */

export type ClaimRewardArgs = {
    program: Program<Idl>;
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
    const { program, programId, payer, wallet, mint, seasonId, amount, proof } = args;

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
