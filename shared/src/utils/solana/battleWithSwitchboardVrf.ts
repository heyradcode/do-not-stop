import type { AnchorProvider, Program , Idl } from '@coral-xyz/anchor';
import { EventParser } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import { battleRequestPda, globalStatePda, petPdaByAsset } from './pdas';
import { fetchAssetByPetId, getAccountClient } from './accountClient';
import { toU32 } from './numbers';
import {
    COMMIT_REVEAL_WAIT_MS,
    REVEAL_BACKOFF_MS,
    REVEAL_RETRIES,
    sendSignedTx,
    waitForRevealIx,
} from './switchboardVrfTx';
import { sleep } from '../common';

/** Parse `firstWins` from the `BattleResolved` Anchor event in settle tx logs. */
const parseFirstWins = async (
    program: Program<Idl>,
    connection: AnchorProvider['connection'],
    sig: string,
): Promise<boolean | null> => {
    try {
        const tx = await connection.getTransaction(sig, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
        });
        const logs = tx?.meta?.logMessages ?? [];
        const parser = new EventParser(program.programId, program.coder);
        for (const event of parser.parseLogs(logs)) {
            if (event.name === 'BattleResolved') {
                return (event.data as { firstWins: boolean }).firstWins;
            }
        }
    } catch {
        // Non-fatal — caller gets null and UI falls back to stat-diff.
    }
    return null;
}

export type BattleVrfResult = { sig: string; firstWins: boolean | null };

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

export type BattleWithVrfArgs = {
    program: Program<Idl>;
    provider: AnchorProvider;
    programId: PublicKey;
    owner: PublicKey;
    attackerPetId: number;
    defenderPetId: number;
    /** Pubkey of the asset account for the attacker's pet (v2.1 asset-keyed PDA). */
    attackerAssetKey: string;
    /** Defaults to `owner` for same-wallet battles. */
    defenderOwner?: PublicKey;
    /** Fires after commit tx confirms, while the oracle is fulfilling randomness. */
    onCommitted?: () => void;
};

/** Completes a battle whose commit phase succeeded but settle was never submitted. */
const trySettlePendingBattle = async (args: BattleWithVrfArgs): Promise<BattleVrfResult | null> => {
    const { program, provider, programId, owner, onCommitted } = args;
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
    const [battleRequest] = battleRequestPda(programId, owner);

    const attackerAsset = await requireAsset(program, attackerPetId);
    const defenderAsset = await requireAsset(program, defenderPetId);
    const [attackerPet] = petPdaByAsset(programId, attackerAsset.toBase58());
    const [defenderPet] = petPdaByAsset(programId, defenderAsset.toBase58());

    const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
    const randomness = new sb.Randomness(queue.program, randomnessPk);

    onCommitted?.();
    await sleep(COMMIT_REVEAL_WAIT_MS);
    const revealIx = await waitForRevealIx(randomness, owner, REVEAL_RETRIES, REVEAL_BACKOFF_MS);

    const settleBattleIx = await program.methods
        .settleBattle()
        .accounts({
            globalState,
            attackerOwner: owner,
            attackerAsset,
            attackerPet,
            defenderOwner: defenderOwnerPk,
            defenderAsset,
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
    const sig = await sendSignedTx(provider, settleTx);
    const firstWins = await parseFirstWins(program, connection, sig);
    return { sig, firstWins };
}

/**
 * Two-phase battle using Switchboard On-Demand VRF (commit → reveal).
 * Returns the settle tx signature and parsed `firstWins` from the `BattleResolved` event.
 */
export const battleWithSwitchboardVrf = async (args: BattleWithVrfArgs): Promise<BattleVrfResult> => {
    const resumed = await trySettlePendingBattle(args);
    if (resumed) return resumed;

    const {
        program,
        provider,
        programId,
        owner,
        defenderPetId,
        attackerAssetKey,
        defenderOwner = owner,
        onCommitted,
    } = args;
    const connection = provider.connection;

    const attackerAsset = new PublicKey(attackerAssetKey);
    const defenderAsset = await requireAsset(program, defenderPetId);

    const [globalState] = globalStatePda(programId);
    const [attackerPet] = petPdaByAsset(programId, attackerAssetKey);
    const [defenderPet] = petPdaByAsset(programId, defenderAsset.toBase58());
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
            attackerAsset,
            attackerPet,
            defenderOwner,
            defenderAsset,
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
    onCommitted?.();

    await sleep(COMMIT_REVEAL_WAIT_MS);
    const revealIx = await waitForRevealIx(randomness, owner, REVEAL_RETRIES, REVEAL_BACKOFF_MS);

    const settleBattleIx = await program.methods
        .settleBattle()
        .accounts({
            globalState,
            attackerOwner: owner,
            attackerAsset,
            attackerPet,
            defenderOwner,
            defenderAsset,
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
    const sig = await sendSignedTx(provider, settleTx);
    const firstWins = await parseFirstWins(program, connection, sig);
    return { sig, firstWins };
}
