import {
    decodePetAccount,
    PET_ACCOUNT_LEN,
    PET_ACCOUNT_DISCRIMINATOR_B58,
} from './decode';
import type { RosterPet } from '@repositories/roster.repository';

/**
 * Minimal Solana JSON-RPC client over a Helius endpoint. Replaces the
 * Substreams firehose: we read `PetAccount` state directly via RPC, both for
 * the periodic full reconciliation scan (`getProgramPets`) and for the
 * webhook's targeted lookups (`getPetsByAddresses`).
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

interface RpcAccount {
    // [base64 data, "base64"] when encoding=base64
    data: [string, string];
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
    const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) {
        throw new Error(`Helius RPC ${method} failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) {
        throw new Error(`Helius RPC ${method} error: ${json.error.message}`);
    }
    return json.result as T;
}

function accountToPet(account: RpcAccount | null): RosterPet | null {
    if (!account) return null;
    return decodePetAccount(Buffer.from(account.data[0], 'base64'));
}

export function createHeliusRpc(rpcUrl: string, programId: string): HeliusRpc {
    return {
        async getProgramPets(): Promise<RosterPet[]> {
            const accounts = await rpcCall<{ pubkey: string; account: RpcAccount }[]>(
                rpcUrl,
                'getProgramAccounts',
                [
                    programId,
                    {
                        encoding: 'base64',
                        // Cheap pre-filters so the RPC only returns PetAccounts.
                        filters: [
                            { dataSize: PET_ACCOUNT_LEN },
                            { memcmp: { offset: 0, bytes: PET_ACCOUNT_DISCRIMINATOR_B58 } },
                        ],
                    },
                ]
            );

            return accounts
                .map((entry) => accountToPet(entry.account))
                .filter((pet): pet is RosterPet => pet !== null);
        },

        async getPetsByAddresses(addresses: string[]): Promise<RosterPet[]> {
            const unique = [...new Set(addresses)];
            const pets: RosterPet[] = [];

            for (let i = 0; i < unique.length; i += MAX_ACCOUNTS_PER_CALL) {
                const batch = unique.slice(i, i + MAX_ACCOUNTS_PER_CALL);
                const { value } = await rpcCall<{ value: (RpcAccount | null)[] }>(
                    rpcUrl,
                    'getMultipleAccounts',
                    [batch, { encoding: 'base64' }]
                );

                for (const account of value) {
                    const pet = accountToPet(account);
                    if (pet) pets.push(pet);
                }
            }

            return pets;
        },
    };
}
