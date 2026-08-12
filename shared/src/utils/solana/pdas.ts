import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';

const GLOBAL_STATE_SEED = Buffer.from('global-state');
const PLAYER_PROFILE_SEED = Buffer.from('player-profile');
const PET_SEED = Buffer.from('pet');
const BREED_REQUEST_SEED = Buffer.from('breed-request');
const MARRIAGE_PROPOSAL_SEED = Buffer.from('marriage-proposal');
const FEE_VAULT_SEED = Buffer.from('fee-vault');
const MINT_REQUEST_SEED = Buffer.from('mint-request');
const STUD_FEE_SEED = Buffer.from('stud-fee');
const ITEM_SEED = Buffer.from('item');
const ITEM_SLOT_SEED = Buffer.from('item-slot');
const EQUIPMENT_SEED = Buffer.from('equipment');

/** `u64` seed component, little-endian, matching `&item_type.to_le_bytes()` in Rust. */
const itemTypeSeed = (itemType: string | bigint): Buffer => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(itemType), 0);
    return buf;
};

export const globalStatePda = (programId: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([GLOBAL_STATE_SEED], programId);
};

export const playerProfilePda = (programId: PublicKey, owner: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([PLAYER_PROFILE_SEED, owner.toBuffer()], programId);
};

/** Pending breed PDA while Switchboard randomness is in flight. */
export const breedRequestPda = (programId: PublicKey, owner: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([BREED_REQUEST_SEED, owner.toBuffer()], programId);
};

/** v2.1 pet PDA keyed by Metaplex Core asset address: seeds ["pet", asset_pubkey]. */
export const petPdaByAsset = (programId: PublicKey, assetKey: string): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([PET_SEED, new PublicKey(assetKey).toBuffer()], programId);
};

/** Marriage proposal PDA: seeds ["marriage-proposal", pet_a_id_le_u32]. */
export const marriageProposalPda = (programId: PublicKey, petAId: number): [PublicKey, number] => {
    const idBuf = Buffer.alloc(4);
    idBuf.writeUInt32LE(petAId >>> 0, 0);
    return PublicKey.findProgramAddressSync([MARRIAGE_PROPOSAL_SEED, idBuf], programId);
};

/** Fee vault PDA: seeds ["fee-vault"]. Collects level-up, train, breed, and mint fees. */
export const feeVaultPda = (programId: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([FEE_VAULT_SEED], programId);
};

/** Mint request PDA: seeds ["mint-request", owner]. One per wallet, closed after settle. */
export const mintRequestPda = (programId: PublicKey, owner: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([MINT_REQUEST_SEED, owner.toBuffer()], programId);
};

/** Stud-fee escrow PDA for cross-owner breeding: seeds ["stud-fee", other_owner]. */
export const studFeeAccountPda = (programId: PublicKey, otherOwner: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([STUD_FEE_SEED, otherOwner.toBuffer()], programId);
};

// ─── Inventory (roadmap §4) ──────────────────────────────────────────────────

/** One wallet's holding of one item type: seeds ["item", owner, item_type_le_u64]. */
export const itemBalancePda = (
    programId: PublicKey,
    owner: PublicKey,
    itemType: string | bigint,
): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([ITEM_SEED, owner.toBuffer(), itemTypeSeed(itemType)], programId);
};

/** The catalog entry saying which slot an item may occupy: seeds ["item-slot", item_type_le_u64]. */
export const itemSlotPda = (programId: PublicKey, itemType: string | bigint): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([ITEM_SLOT_SEED, itemTypeSeed(itemType)], programId);
};

/**
 * A pet's equipped slots: seeds ["equipment", asset_pubkey].
 *
 * Seeded by the Metaplex Core asset, like `petPdaByAsset`, because that is what ownership is
 * read from on this chain. The account itself also stores the numeric pet id, which is what
 * the `pet_equipment` projection records so it can be joined to `pet_roster`.
 */
export const petEquipmentPda = (programId: PublicKey, assetKey: string): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([EQUIPMENT_SEED, new PublicKey(assetKey).toBuffer()], programId);
};
