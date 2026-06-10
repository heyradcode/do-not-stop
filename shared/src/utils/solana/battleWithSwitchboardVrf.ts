import type { AnchorProvider, Program , Idl } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import { battleRequestPda, globalStatePda, petPda } from './pdas';
import { getAccountClient } from './accountClient';
import { toU32 } from './numbers';
import {
    COMMIT_REVEAL_WAIT_MS,
    REVEAL_BACKOFF_MS,
    REVEAL_RETRIES,
    sendSignedTx,
    waitForRevealIx,
} from './switchboardVrfTx';
import { sleep } from '../common';

const toPublicKey = (value: unknown): PublicKey  => {
    if (value instanceof PublicKey) return value;
    if (value && typeof value === 'object' && 'toBase58' in value) {
        return new PublicKey((value as { toBase58: () => string }).toBase58());
    }
    return new PublicKey(String(value));
}

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

/** Completes a battle whose commit phase succeeded but settle was never submitted. */
const trySettlePendingBattle = async (args: BattleWithVrfArgs): Promise<string | null> => {
    const { program, provider, programId, owner } = args;
    const connection = provider.connection;
    const [battleRequestKey] = battleRequestPda(programId, owner);
    const pending = await getAccountClient(program, 'battleRequest').fetchNullable(battleRequestKey);
    if (!pending) return null;

    const req = pending as Record<string, unknown>;
    const attackerPetId = toU32(req.attackerPetId);
    const defenderPetId = toU32(req.defenderPetId);
    const defenderOwnerPk = toPublicKey(req.defenderOwner);
    const randomnessPk = toPublicKey(req.randomnessAccount);

    const [globalState] = globalStatePda(programId);
    const [attackerPet] = petPda(programId, owner, attackerPetId);
    const [defenderPet] = petPda(programId, defenderOwnerPk, defenderPetId);
    const [battleRequest] = battleRequestPda(programId, owner);

    const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
    const randomness = new sb.Randomness(queue.program, randomnessPk);

    await sleep(COMMIT_REVEAL_WAIT_MS);
    const revealIx = await waitForRevealIx(randomness, owner, REVEAL_RETRIES, REVEAL_BACKOFF_MS);

    const settleBattleIx = await program.methods
        .settleBattle()
        .accounts({
            globalState,
            attackerOwner: owner,
            attackerPet,
            defenderOwner: defenderOwnerPk,
            defenderPet,
            battleRequest,
            randomnessAccountData: randomnessPk,
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

/**
 * Two-phase battle using Switchboard On-Demand VRF (commit → reveal).
 * Returns the settle transaction signature.
 */
export const battleWithSwitchboardVrf = async (args: BattleWithVrfArgs): Promise<string> => {
    const resumed = await trySettlePendingBattle(args);
    if (resumed) return resumed;

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

    // Create + Switchboard commit + program commit in one tx (wallet prompt 1 of 2).
    const commitTx = await sb.asV0Tx({
        connection,
        ixs: [createIx, commitIx, commitBattleIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    await sendSignedTx(provider, commitTx, [rngKp]);

    await sleep(COMMIT_REVEAL_WAIT_MS);
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
    // Reveal + settle after oracle fulfills randomness (wallet prompt 2 of 2).
    return sendSignedTx(provider, settleTx);
}
