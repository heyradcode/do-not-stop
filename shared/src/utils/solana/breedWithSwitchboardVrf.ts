import type { AnchorProvider, Program , Idl } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import {
    breedRequestPda,
    feeVaultPda,
    globalStatePda,
    petPdaByAsset,
    studFeeAccountPda,
} from './pdas';
import { fetchAssetByPetId, getAccountClient } from './accountClient';
import { toU32 } from './numbers';
import {
    COMMIT_REVEAL_WAIT_MS,
    REVEAL_BACKOFF_MS,
    REVEAL_RETRIES,
    sendSignedTx,
    waitForRevealIx,
} from './switchboardVrfTx';
import { MPL_CORE_PROGRAM_ID } from './constants';
import { sleep } from '../common';

const toPublicKey = (value: unknown): PublicKey  => {
    if (value instanceof PublicKey) return value;
    if (value && typeof value === 'object' && 'toBase58' in value) {
        return new PublicKey((value as { toBase58: () => string }).toBase58());
    }
    return new PublicKey(String(value));
}

const requireAsset = async (program: Program<Idl>, petId: number): Promise<PublicKey>  => {
    const asset = await fetchAssetByPetId(program, petId);
    if (!asset) throw new Error(`Pet ${petId} not found on-chain`);
    return asset;
}

export type BreedWithVrfArgs = {
    program: Program<Idl>;
    provider: AnchorProvider;
    programId: PublicKey;
    owner: PublicKey;
    parent1Id: number;
    parent2Id: number;
    name: string;
    /** Core asset pubkey for parent1 (caller's pet). */
    parent1AssetKey: string;
    /**
     * Core asset pubkey for parent2. If omitted (cross-owner breeding where the
     * partner's pet is not in the local list), it is looked up on-chain by ID.
     */
    parent2AssetKey?: string;
    /**
     * Owner of parent2. Defaults to `owner` (same-wallet breeding).
     * Required for cross-owner breeding.
     */
    parent2Owner?: PublicKey;
    /** Fires after commit tx confirms, while the oracle is fulfilling randomness. */
    onCommitted?: () => void;
};

/** Completes a breed whose commit phase succeeded but settle was never submitted. */
const trySettlePendingBreed = async (args: BreedWithVrfArgs): Promise<string | null> => {
    const { program, provider, programId, owner, onCommitted } = args;
    const connection = provider.connection;
    const [breedRequestKey] = breedRequestPda(programId, owner);
    const pending = await getAccountClient(program, 'breedRequest').fetchNullable(breedRequestKey);
    if (!pending) return null;

    const req = pending as Record<string, unknown>;
    const parent1Id = toU32(req.parent1Id);
    const parent2Id = toU32(req.parent2Id);
    const randomnessPk = toPublicKey(req.randomnessAccount);
    const otherOwner = toPublicKey(req.otherOwner);
    const isDefaultOwner = otherOwner.equals(PublicKey.default);
    const resolvedParent2Owner = isDefaultOwner ? owner : otherOwner;

    const [globalState] = globalStatePda(programId);
    const [breedRequest] = breedRequestPda(programId, owner);
    const [studFeeAccount] = studFeeAccountPda(programId, resolvedParent2Owner);

    const parent1Asset = await requireAsset(program, parent1Id);
    const parent2Asset = await requireAsset(program, parent2Id);
    const [parent1] = petPdaByAsset(programId, parent1Asset.toBase58());
    const [parent2] = petPdaByAsset(programId, parent2Asset.toBase58());

    const gs = (await getAccountClient(program, 'globalState').fetch(globalState)) as {
        collection?: unknown;
    };
    const collection = toPublicKey(gs.collection);

    const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
    const randomness = new sb.Randomness(queue.program, randomnessPk);

    onCommitted?.();
    await sleep(COMMIT_REVEAL_WAIT_MS);
    const revealIx = await waitForRevealIx(randomness, owner, REVEAL_RETRIES, REVEAL_BACKOFF_MS);

    const assetKp = Keypair.generate();
    const [child] = petPdaByAsset(programId, assetKp.publicKey.toBase58());

    const settleBreedIx = await program.methods
        .settleBreed()
        .accounts({
            globalState,
            owner,
            mplCoreProgram: new PublicKey(MPL_CORE_PROGRAM_ID),
            asset: assetKp.publicKey,
            collection,
            parent1Asset,
            parent1,
            parent2Owner: resolvedParent2Owner,
            parent2Asset,
            parent2,
            child,
            breedRequest,
            studFeeAccount,
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
    return sendSignedTx(provider, settleTx, [assetKp]);
}

/**
 * Two-phase breed using Switchboard On-Demand VRF (commit → reveal).
 * Returns the settle transaction signature (child minted).
 */
export const breedWithSwitchboardVrf = async (args: BreedWithVrfArgs): Promise<string> => {
    const resumed = await trySettlePendingBreed(args);
    if (resumed) return resumed;

    const {
        program,
        provider,
        programId,
        owner,
        parent2Id,
        name,
        parent1AssetKey,
        parent2AssetKey,
        parent2Owner = owner,
        onCommitted,
    } = args;
    const connection = provider.connection;

    const parent1Asset = new PublicKey(parent1AssetKey);
    const parent2Asset = parent2AssetKey
        ? new PublicKey(parent2AssetKey)
        : await requireAsset(program, parent2Id);

    const [globalState] = globalStatePda(programId);
    const [parent1] = petPdaByAsset(programId, parent1Asset.toBase58());
    const [parent2] = petPdaByAsset(programId, parent2Asset.toBase58());
    const [breedRequest] = breedRequestPda(programId, owner);
    const [feeVault] = feeVaultPda(programId);
    const [studFeeAccount] = studFeeAccountPda(programId, parent2Owner);

    const gs = (await getAccountClient(program, 'globalState').fetch(globalState)) as {
        collection?: unknown;
    };
    const collection = toPublicKey(gs.collection);

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
    const commitBreedIx = await program.methods
        .commitBreed(rngKp.publicKey, name)
        .accounts({
            globalState,
            owner,
            parent1Asset,
            parent1,
            parent2Owner,
            parent2Asset,
            parent2,
            breedRequest,
            feeVault,
            studFeeAccount,
            randomnessAccountData: rngKp.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    // Create + Switchboard commit + program commit in one tx (wallet prompt 1 of 2).
    const commitTx = await sb.asV0Tx({
        connection,
        ixs: [createIx, commitIx, commitBreedIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    await sendSignedTx(provider, commitTx, [rngKp]);
    onCommitted?.();

    await sleep(COMMIT_REVEAL_WAIT_MS);
    const revealIx = await waitForRevealIx(randomness, owner, REVEAL_RETRIES, REVEAL_BACKOFF_MS);

    const assetKp = Keypair.generate();
    const [child] = petPdaByAsset(programId, assetKp.publicKey.toBase58());

    const settleBreedIx = await program.methods
        .settleBreed()
        .accounts({
            globalState,
            owner,
            mplCoreProgram: new PublicKey(MPL_CORE_PROGRAM_ID),
            asset: assetKp.publicKey,
            collection,
            parent1Asset,
            parent1,
            parent2Owner,
            parent2Asset,
            parent2,
            child,
            breedRequest,
            studFeeAccount,
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
    // Reveal + settle after oracle fulfills randomness (wallet prompt 2 of 2).
    return sendSignedTx(provider, settleTx, [assetKp]);
}
