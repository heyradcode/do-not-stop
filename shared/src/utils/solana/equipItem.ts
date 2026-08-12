import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN, type Idl, type Program } from '@coral-xyz/anchor';

import { MPL_CORE_PROGRAM_ID } from './constants';
import { getAccountClient } from './accountClient';
import { globalStatePda, itemBalancePda, itemSlotPda, petEquipmentPda, petPdaByAsset } from './pdas';

/**
 * Equipping and unequipping on Solana (roadmap §4).
 *
 * `program.methods.<name>!(...)`: `program: Program<Idl>` is an untyped generic IDL, so
 * `.methods` is an index signature and consumers with `noUncheckedIndexedAccess` see every
 * property as possibly undefined. The instruction exists on whichever program's IDL was
 * fetched — asserted, not defensively checked, matching the other Solana writers here.
 *
 * Both instructions are sent by the player's own wallet and can only ever be: the program
 * requires the signer to be the pet's Core asset owner. That is what makes gear in a battle
 * snapshot checkable against chain state by someone who does not trust the operator, rather
 * than an assertion by it.
 */

export type EquipItemArgs = {
    program: Program<Idl>;
    programId: PublicKey;
    owner: PublicKey;
    /** The pet's Metaplex Core asset, base58. Not the numeric pet id — see `assertAsset`. */
    assetKey: string;
    /** Equip slot 0-2. */
    slot: number;
    /** Item type as a decimal string. */
    itemType: string;
};

export type UnequipItemArgs = Omit<EquipItemArgs, 'itemType'> & { itemType: string };

/**
 * Rejects a pet id passed where the Core asset belongs.
 *
 * Solana pets have both: a `u32` id and a 32-byte asset pubkey, and every PDA here is
 * seeded by the asset. A numeric id would still parse as *something* under `new PublicKey`
 * only if it were 32 bytes of base58, so the common mistake fails here with a readable
 * message instead of deriving an address nothing lives at and reporting "account not found".
 */
const assertAsset = (assetKey: string): PublicKey => {
    if (/^\d+$/.test(assetKey)) {
        throw new Error(
            `expected a Metaplex Core asset pubkey, got the numeric pet id ${assetKey}; ` +
                'Solana equip is keyed by the asset',
        );
    }
    return new PublicKey(assetKey);
};

/** The accounts both instructions share, in the order the program declares them. */
const commonAccounts = async (args: Omit<EquipItemArgs, 'itemType' | 'slot'>) => {
    const { program, programId, owner, assetKey } = args;
    const asset = assertAsset(assetKey);

    const [globalState] = globalStatePda(programId);
    const [pet] = petPdaByAsset(programId, asset.toBase58());
    const [equipment] = petEquipmentPda(programId, asset.toBase58());

    // The collection is read rather than configured: it is whatever `initialize` created,
    // and a client holding a stale copy would fail the program's address constraint.
    const gs = (await getAccountClient(program, 'globalState').fetch(globalState)) as {
        collection?: unknown;
    };
    const collection = new PublicKey(String(gs.collection));

    return { globalState, owner, petAsset: asset, pet, collection, equipment };
};

/** Escrows one item onto a pet. Freezes the asset if this is its first piece of gear. */
export const equipItemOnSolana = async (args: EquipItemArgs): Promise<string> => {
    const { program, programId, owner, slot, itemType } = args;
    const accounts = await commonAccounts(args);
    const [itemSlot] = itemSlotPda(programId, itemType);
    const [balance] = itemBalancePda(programId, owner, itemType);

    return program.methods
        .equip!(slot, new BN(itemType))
        .accounts({
            ...accounts,
            itemSlot,
            balance,
            mplCoreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .rpc();
};

/**
 * Returns the item in a slot to the pet's owner. Thaws the asset once nothing is left.
 *
 * `itemType` names the balance PDA the item is returned to. The program does not take the
 * caller's word for it: it reads which item is in the slot and refuses if the two disagree,
 * so a wrong value here fails rather than crediting the wrong stack.
 */
export const unequipItemOnSolana = async (args: UnequipItemArgs): Promise<string> => {
    const { program, programId, owner, slot, itemType } = args;
    const accounts = await commonAccounts(args);
    const [balance] = itemBalancePda(programId, owner, itemType);

    return program.methods
        .unequip!(slot, new BN(itemType))
        .accounts({
            ...accounts,
            balance,
            mplCoreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .rpc();
};
