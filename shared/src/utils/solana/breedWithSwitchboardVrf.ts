import type { AnchorProvider, Program , Idl } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import {
    breedRequestPda,
    globalStatePda,
    petPda,
    playerProfilePda,
} from './pdas';
import { getAccountClient } from './accountClient';
import { toU32 } from './numbers';
import {
    COMMIT_REVEAL_WAIT_MS,
    REVEAL_BACKOFF_MS,
    REVEAL_RETRIES,
    sendSignedTx,
    waitForRevealIx,
} from './switchboardVrfTx';

export type BreedWithVrfArgs = {
    program: Program<Idl>;
    provider: AnchorProvider;
    programId: PublicKey;
    owner: PublicKey;
    parent1Id: number;
    parent2Id: number;
    name: string;
};

function toPublicKey(value: unknown): PublicKey {
    if (value instanceof PublicKey) return value;
    if (value && typeof value === 'object' && 'toBase58' in value) {
        return new PublicKey((value as { toBase58: () => string }).toBase58());
    }
    return new PublicKey(String(value));
}

/** Completes a breed whose commit phase succeeded but settle was never submitted. */
async function trySettlePendingBreed(args: BreedWithVrfArgs): Promise<string | null> {
    const { program, provider, programId, owner } = args;
    const connection = provider.connection;
    const [breedRequestKey] = breedRequestPda(programId, owner);
    const pending = await getAccountClient(program, 'breedRequest').fetchNullable(breedRequestKey);
    if (!pending) return null;

    const req = pending as Record<string, unknown>;
    const parent1Id = toU32(req.parent1Id);
    const parent2Id = toU32(req.parent2Id);
    const childId = toU32(req.childId);
    const randomnessPk = toPublicKey(req.randomnessAccount);

    const [globalState] = globalStatePda(programId);
    const [playerProfile] = playerProfilePda(programId, owner);
    const [parent1] = petPda(programId, owner, parent1Id);
    const [parent2] = petPda(programId, owner, parent2Id);
    const [child] = petPda(programId, owner, childId);
    const [breedRequest] = breedRequestPda(programId, owner);

    const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
    const randomness = new sb.Randomness(queue.program, randomnessPk);

    await new Promise((r) => setTimeout(r, COMMIT_REVEAL_WAIT_MS));
    const revealIx = await waitForRevealIx(randomness, owner, REVEAL_RETRIES, REVEAL_BACKOFF_MS);

    const settleBreedIx = await program.methods
        .settleBreed()
        .accounts({
            globalState,
            owner,
            playerProfile,
            parent1,
            parent2,
            child,
            breedRequest,
            randomnessAccountData: randomnessPk,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    const settleTx = await sb.asV0Tx({
        connection,
        ixs: [revealIx, settleBreedIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    return sendSignedTx(provider, settleTx);
}

/**
 * Two-phase breed using Switchboard On-Demand VRF (commit → reveal).
 * Returns the settle transaction signature (child minted).
 */
export async function breedWithSwitchboardVrf(args: BreedWithVrfArgs): Promise<string> {
    const resumed = await trySettlePendingBreed(args);
    if (resumed) return resumed;

    const { program, provider, programId, owner, parent1Id, parent2Id, name } = args;
    const connection = provider.connection;

    const [globalState] = globalStatePda(programId);
    const [playerProfile] = playerProfilePda(programId, owner);
    const [parent1] = petPda(programId, owner, parent1Id);
    const [parent2] = petPda(programId, owner, parent2Id);
    const [breedRequest] = breedRequestPda(programId, owner);

    const gs = (await getAccountClient(program, 'globalState').fetch(globalState)) as {
        nextPetId?: unknown;
    };
    const childId = toU32(gs.nextPetId);
    const [child] = petPda(programId, owner, childId);

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
    const commitBreedIx = await program.methods
        .commitBreed(rngKp.publicKey, name)
        .accounts({
            globalState,
            owner,
            playerProfile,
            parent1,
            parent2,
            breedRequest,
            randomnessAccountData: rngKp.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    const commitTx = await sb.asV0Tx({
        connection,
        ixs: [commitIx, commitBreedIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    await sendSignedTx(provider, commitTx);

    await new Promise((r) => setTimeout(r, COMMIT_REVEAL_WAIT_MS));
    const revealIx = await waitForRevealIx(randomness, owner, REVEAL_RETRIES, REVEAL_BACKOFF_MS);

    const settleBreedIx = await program.methods
        .settleBreed()
        .accounts({
            globalState,
            owner,
            playerProfile,
            parent1,
            parent2,
            child,
            breedRequest,
            randomnessAccountData: rngKp.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    const settleTx = await sb.asV0Tx({
        connection,
        ixs: [revealIx, settleBreedIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    return sendSignedTx(provider, settleTx);
}
