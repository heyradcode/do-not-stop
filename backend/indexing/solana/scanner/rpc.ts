import { Connection, PublicKey } from '@solana/web3.js';
import {
    decodePetAccount,
    PET_ACCOUNT_LEN,
    PET_ACCOUNT_DISCRIMINATOR_B58,
} from './decode';
import type { RosterPet } from '@repositories/roster.repository';

/**
 * Solana RPC client for the Helius endpoint. Replaces the Substreams firehose:
 * we read `PetAccount` state directly via @solana/web3.js RPC, both for the periodic full
 * reconciliation scan (`getProgramPets`) and for the webhook's targeted
 * lookups (`getPetsByAddresses`).
 *
 * The `rpcUrl` is the full Helius URL including the api-key query param, e.g.
 * `https://devnet.helius-rpc.com/?api-key=<key>`.
 */
export interface HeliusRpc {
    /** All `PetAccount`s owned by the program — the reconciliation source. */
    getProgramPets(): Promise<RosterPet[]>;
    /** Decode only the given accounts as pets; non-pet accounts are dropped. */
    getPetsByAddresses(addresses: string[]): Promise<RosterPet[]>;
}

/** RPC `getMultipleAccounts` caps at 100 addresses per call. */
const MAX_ACCOUNTS_PER_CALL = 100;

function decodeAccountData(data: Buffer): RosterPet | null {
    return decodePetAccount(data);
}

export function createHeliusRpc(rpcUrl: string, programId: string): HeliusRpc {
    const connection = new Connection(rpcUrl, 'confirmed');
    const programPublicKey = new PublicKey(programId);

    return {
        async getProgramPets(): Promise<RosterPet[]> {
            const accounts = await connection.getProgramAccounts(programPublicKey, {
                encoding: 'base64',
                filters: [
                    { dataSize: PET_ACCOUNT_LEN },
                    { memcmp: { offset: 0, bytes: PET_ACCOUNT_DISCRIMINATOR_B58 } },
                ],
            });

            return accounts
                .map(({ account }) => decodeAccountData(account.data as Buffer))
                .filter((pet): pet is RosterPet => pet !== null);
        },

        async getPetsByAddresses(addresses: string[]): Promise<RosterPet[]> {
            const unique = [...new Set(addresses)];
            const pets: RosterPet[] = [];

            for (let i = 0; i < unique.length; i += MAX_ACCOUNTS_PER_CALL) {
                const batch = unique.slice(i, i + MAX_ACCOUNTS_PER_CALL).map((addr) => new PublicKey(addr));
                const accounts = await connection.getMultipleAccountsInfo(batch);

                for (const account of accounts) {
                    if (account?.data) {
                        const pet = decodeAccountData(account.data as Buffer);
                        if (pet) pets.push(pet);
                    }
                }
            }

            return pets;
        },
    };
}
