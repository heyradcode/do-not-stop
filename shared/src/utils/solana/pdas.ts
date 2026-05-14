import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';

const GLOBAL_STATE_SEED = Buffer.from('global-state');
const PLAYER_PROFILE_SEED = Buffer.from('player-profile');
const PET_SEED = Buffer.from('pet');

export function globalStatePda(programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([GLOBAL_STATE_SEED], programId);
}

export function playerProfilePda(programId: PublicKey, owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([PLAYER_PROFILE_SEED, owner.toBuffer()], programId);
}

/** Pet PDA: seeds `["pet", owner, pet_id_le_u32]`. */
export function petPda(programId: PublicKey, owner: PublicKey, petId: number): [PublicKey, number] {
    const idBuf = Buffer.alloc(4);
    idBuf.writeUInt32LE(petId >>> 0, 0);
    return PublicKey.findProgramAddressSync([PET_SEED, owner.toBuffer(), idBuf], programId);
}
