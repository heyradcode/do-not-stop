import type { AnchorProvider, Program , Idl } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import {
    feeVaultPda,
    globalStatePda,
    mintRequestPda,
    petPdaByAsset,
    playerProfilePda,
} from './pdas';
import { getAccountClient } from './accountClient';
import {
    vrfTimingForEndpoint,
    sendSignedTx,
    waitForRevealIx,
} from './switchboardVrfTx';
import { MPL_CORE_PROGRAM_ID } from './constants';
import { sleep } from '../common';

// `program.methods.<name>!(...)` below: `program: Program<Idl>` (untyped generic IDL, not
// a generated `Program<Cryptopets>`) makes `.methods` an index signature, so consumers with
// `noUncheckedIndexedAccess` enabled (backend, not frontend/mobile) see every property as
// possibly undefined. The instruction genuinely exists on whichever program's IDL was
// fetched — asserted, not defensively checked.

const toPublicKey = (value: unknown): PublicKey => {
    if (value instanceof PublicKey) return value;
    if (value && typeof value === 'object' && 'toBase58' in value) {
        return new PublicKey((value as { toBase58: () => string }).toBase58());
    }
    return new PublicKey(String(value));
};

export type MintWithVrfArgs = {
    program: Program<Idl>;
    provider: AnchorProvider;
    programId: PublicKey;
    owner: PublicKey;
    name: string;
};

/** Completes a mint whose commit phase succeeded but settle was never submitted. */
const trySettlePendingMint = async (args: MintWithVrfArgs): Promise<string | null> => {
    const { program, provider, programId, owner } = args;
    const connection = provider.connection;
    const [mintRequestKey] = mintRequestPda(programId, owner);
    const pending = await getAccountClient(program, 'mintRequest').fetchNullable(mintRequestKey);
    if (!pending) return null;

    const req = pending as Record<string, unknown>;
    const randomnessPk = toPublicKey(req.randomnessAccount);

    const [globalState] = globalStatePda(programId);
    const [mintRequest] = mintRequestPda(programId, owner);

    const gs = (await getAccountClient(program, 'globalState').fetch(globalState)) as {
        collection?: unknown;
    };
    const collection = toPublicKey(gs.collection);

    const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
    const randomness = new sb.Randomness(queue.program, randomnessPk);

    const { commitRevealWaitMs, revealRetries, revealBackoffMs } = vrfTimingForEndpoint(connection.rpcEndpoint);
    await sleep(commitRevealWaitMs);
    const revealIx = await waitForRevealIx(randomness, owner, revealRetries, revealBackoffMs);

    const assetKp = Keypair.generate();
    const [pet] = petPdaByAsset(programId, assetKp.publicKey.toBase58());

    const settleMintIx = await program.methods
        .settleMint!()
        .accounts({
            globalState,
            owner,
            mplCoreProgram: new PublicKey(MPL_CORE_PROGRAM_ID),
            asset: assetKp.publicKey,
            collection,
            pet,
            mintRequest,
            randomnessAccountData: randomnessPk,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    const settleTx = await sb.asV0Tx({
        connection,
        ixs: [revealIx, settleMintIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    return sendSignedTx(provider, settleTx, [assetKp]);
};

/**
 * Two-phase gacha mint using Switchboard On-Demand VRF (commit → reveal).
 * DNA and rarity are derived from VRF randomness at settle time.
 * Returns the settle transaction signature.
 */
export const mintWithSwitchboardVrf = async (args: MintWithVrfArgs): Promise<string> => {
    const resumed = await trySettlePendingMint(args);
    if (resumed) return resumed;

    const { program, provider, programId, owner, name } = args;
    const connection = provider.connection;

    const [globalState] = globalStatePda(programId);
    const [playerProfile] = playerProfilePda(programId, owner);
    const [mintRequest] = mintRequestPda(programId, owner);
    const [feeVault] = feeVaultPda(programId);

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
    const commitMintIx = await program.methods
        .commitMint!(rngKp.publicKey, name)
        .accounts({
            globalState,
            owner,
            playerProfile,
            mintRequest,
            feeVault,
            randomnessAccountData: rngKp.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    // Create + Switchboard commit + program commit in one tx (wallet prompt 1 of 2).
    const commitTx = await sb.asV0Tx({
        connection,
        ixs: [createIx, commitIx, commitMintIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    await sendSignedTx(provider, commitTx, [rngKp]);

    const { commitRevealWaitMs, revealRetries, revealBackoffMs } = vrfTimingForEndpoint(connection.rpcEndpoint);
    await sleep(commitRevealWaitMs);
    const revealIx = await waitForRevealIx(randomness, owner, revealRetries, revealBackoffMs);

    const assetKp = Keypair.generate();
    const [pet] = petPdaByAsset(programId, assetKp.publicKey.toBase58());

    const settleMintIx = await program.methods
        .settleMint!()
        .accounts({
            globalState,
            owner,
            mplCoreProgram: new PublicKey(MPL_CORE_PROGRAM_ID),
            asset: assetKp.publicKey,
            collection,
            pet,
            mintRequest,
            randomnessAccountData: rngKp.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    const settleTx = await sb.asV0Tx({
        connection,
        ixs: [revealIx, settleMintIx],
        payer: owner,
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
    });
    // Reveal + settle after oracle fulfills randomness (wallet prompt 2 of 2).
    return sendSignedTx(provider, settleTx, [assetKp]);
};
