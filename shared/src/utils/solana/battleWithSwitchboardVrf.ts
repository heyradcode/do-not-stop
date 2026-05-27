import type { AnchorProvider, Program , Idl } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import { battleRequestPda, globalStatePda, petPda } from './pdas';
import {
    COMMIT_REVEAL_WAIT_MS,
    REVEAL_BACKOFF_MS,
    REVEAL_RETRIES,
    sendSignedTx,
    waitForRevealIx,
} from './switchboardVrfTx';

export type BattleWithVrfArgs = {
    program: Program<Idl>;
    provider: AnchorProvider;
    programId: PublicKey;
    owner: PublicKey;
    attackerPetId: number;
    defenderPetId: number;
    /** Defaults to `owner` for same-wallet battles. */
    defenderOwner?: PublicKey;
};

/**
 * Two-phase battle using Switchboard On-Demand VRF (commit → reveal).
 * Returns the settle transaction signature.
 */
export async function battleWithSwitchboardVrf(args: BattleWithVrfArgs): Promise<string> {
    const {
        program,
        provider,
        programId,
        owner,
        attackerPetId,
        defenderPetId,
        defenderOwner = owner,
    } = args;
    const connection = provider.connection;

    const [globalState] = globalStatePda(programId);
    const [attackerPet] = petPda(programId, owner, attackerPetId);
    const [defenderPet] = petPda(programId, defenderOwner, defenderPetId);
    const [battleRequest] = battleRequestPda(programId, owner);

    const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
    const sbProgram = queue.program;
    const rngKp = Keypair.generate();

    const [randomness, createIx] = await sb.Randomness.create(
        sbProgram,
        rngKp,
        queue.pubkey,
        owner
    );

    const createTx = await sb.asV0Tx({
        connection,
        ixs: [createIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    await sendSignedTx(provider, createTx, [rngKp]);

    const commitIx = await randomness.commitIx(queue.pubkey, owner);
    const commitBattleIx = await program.methods
        .commitBattle(rngKp.publicKey)
        .accounts({
            globalState,
            attackerOwner: owner,
            attackerPet,
            defenderOwner,
            defenderPet,
            battleRequest,
            randomnessAccountData: rngKp.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    const commitTx = await sb.asV0Tx({
        connection,
        ixs: [commitIx, commitBattleIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    await sendSignedTx(provider, commitTx);

    await new Promise((r) => setTimeout(r, COMMIT_REVEAL_WAIT_MS));
    const revealIx = await waitForRevealIx(randomness, owner, REVEAL_RETRIES, REVEAL_BACKOFF_MS);

    const settleBattleIx = await program.methods
        .settleBattle()
        .accounts({
            globalState,
            attackerOwner: owner,
            attackerPet,
            defenderOwner,
            defenderPet,
            battleRequest,
            randomnessAccountData: rngKp.publicKey,
        })
        .instruction();

    const settleTx = await sb.asV0Tx({
        connection,
        ixs: [revealIx, settleBattleIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    return sendSignedTx(provider, settleTx);
}
