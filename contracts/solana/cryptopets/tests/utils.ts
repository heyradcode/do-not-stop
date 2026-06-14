// @ts-nocheck
//
// PDA seed helpers for the v2 instruction set (plan-contract-upgrade.md). Seed
// bytes are transcribed from `programs/cryptopets/src/state.rs`'s `SEED`/
// `FEE_VAULT_SEED` constants -- keep these in sync if those change.

import * as anchor from "@coral-xyz/anchor";

export const GLOBAL_STATE_SEED = Buffer.from("global-state");
export const PLAYER_PROFILE_SEED = Buffer.from("player-profile");
export const PET_SEED = Buffer.from("pet");
export const BREED_REQUEST_SEED = Buffer.from("breed-request");
export const BATTLE_REQUEST_SEED = Buffer.from("battle-request");
export const MINT_REQUEST_SEED = Buffer.from("mint-request");
export const MARRIAGE_PROPOSAL_SEED = Buffer.from("marriage-proposal");
export const STUD_FEE_SEED = Buffer.from("stud-fee");
export const FEE_VAULT_SEED = Buffer.from("fee-vault");

export function globalStatePda(programId: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync([GLOBAL_STATE_SEED], programId);
}

export function feeVaultPda(programId: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync([FEE_VAULT_SEED], programId);
}

export function playerProfilePda(programId: anchor.web3.PublicKey, owner: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [PLAYER_PROFILE_SEED, owner.toBuffer()],
    programId,
  );
}

/// `PetAccount` PDAs are seeded by the pet's Metaplex Core asset pubkey (plan
/// §2.3/v2.1 Phase A re-seed), not by owner/id.
export function petPda(programId: anchor.web3.PublicKey, asset: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync([PET_SEED, asset.toBuffer()], programId);
}

export function mintRequestPda(programId: anchor.web3.PublicKey, owner: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [MINT_REQUEST_SEED, owner.toBuffer()],
    programId,
  );
}

export function breedRequestPda(programId: anchor.web3.PublicKey, owner: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [BREED_REQUEST_SEED, owner.toBuffer()],
    programId,
  );
}

export function battleRequestPda(programId: anchor.web3.PublicKey, owner: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [BATTLE_REQUEST_SEED, owner.toBuffer()],
    programId,
  );
}

export function studFeeAccountPda(programId: anchor.web3.PublicKey, owner: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [STUD_FEE_SEED, owner.toBuffer()],
    programId,
  );
}

/// `MarriageProposal` PDAs are seeded by `pet_a`'s on-chain `id` (a `u32`), encoded
/// little-endian to match `&pet_a.id.to_le_bytes()`.
export function marriageProposalPda(programId: anchor.web3.PublicKey, petAId: number) {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(petAId, 0);
  return anchor.web3.PublicKey.findProgramAddressSync(
    [MARRIAGE_PROPOSAL_SEED, idBuf],
    programId,
  );
}

/// Airdrops `lamports` to `pubkey` and waits for confirmation. Defaults to 1 SOL.
export async function fundAccount(
  provider: anchor.Provider,
  pubkey: anchor.web3.PublicKey,
  lamports = anchor.web3.LAMPORTS_PER_SOL,
) {
  const sig = await provider.connection.requestAirdrop(pubkey, lamports);
  await provider.connection.confirmTransaction(sig);
}
