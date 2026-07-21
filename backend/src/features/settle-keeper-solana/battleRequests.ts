import type { PublicKey } from '@solana/web3.js';
import { toU32 } from '@shared/core/node';

/**
 * Normalized fields pulled off an Anchor-decoded `BattleRequest` account
 * (`program.account.battleRequest.all()`'s `.account`). Anchor decodes u32
 * fields as either `BN` or `number` depending on version, hence `toU32`.
 */
export interface DecodedBattleRequest {
    attackerOwner: PublicKey;
    defenderOwner: PublicKey;
    attackerPetId: number;
    defenderPetId: number;
    randomnessAccount: PublicKey;
}

/** Decodes the fields settle needs from a raw Anchor account object. Pure — no chain
 *  access — so it's testable without a validator. */
export function decodeBattleRequest(account: Record<string, unknown>): DecodedBattleRequest {
    return {
        attackerOwner: account.attackerOwner as PublicKey,
        defenderOwner: account.defenderOwner as PublicKey,
        attackerPetId: toU32(account.attackerPetId),
        defenderPetId: toU32(account.defenderPetId),
        randomnessAccount: account.randomnessAccount as PublicKey,
    };
}
