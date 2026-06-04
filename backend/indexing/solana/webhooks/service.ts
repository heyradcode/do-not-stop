import { env } from '@config/env';
import { createHeliusRpc } from '../scanner';
import { upsertPet } from '@repositories/roster.repository';

/**
 * Handle a Helius webhook delivery. Helius fires when a transaction touches the
 * CryptoPets program, but the payload carries the *transaction*, not decoded
 * account state — so we take the account addresses it touched, re-read their
 * current state over Helius RPC, decode any that are `PetAccount`s, and upsert
 * them into `pet_roster`. The periodic indexer scan reconciles anything missed.
 */

/** True when Solana indexing is configured (RPC url + program id present). */
export function isSolanaConfigured(): boolean {
    return Boolean(env.solana.heliusRpcUrl && env.solana.programId);
}

/**
 * Check the shared secret Helius sends in `Authorization`. A configured secret
 * must match. When none is set we accept all calls in dev only — in production a
 * missing secret means reject (and env.ts also fails fast at startup, so this is
 * belt-and-suspenders).
 */
export function isAuthorized(authHeader: string | undefined): boolean {
    const expected = env.solana.webhookSecret;
    if (!expected) return !env.isProduction;
    return authHeader === expected;
}

/**
 * Pull every plausible account address out of a Helius payload, across both the
 * `enhanced` and `raw` webhook shapes. We over-collect on purpose — non-pet
 * accounts simply fail to decode and are dropped downstream.
 */
export function extractAccountAddresses(payload: unknown): string[] {
    const addresses = new Set<string>();

    const add = (value: unknown): void => {
        if (typeof value === 'string' && value.length >= 32 && value.length <= 44) {
            addresses.add(value);
        }
    };

    const items = Array.isArray(payload) ? payload : [payload];
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const tx = item as Record<string, unknown>;

        // enhanced: accountData: [{ account: "..." }, ...]
        if (Array.isArray(tx.accountData)) {
            for (const entry of tx.accountData) {
                add((entry as Record<string, unknown>)?.account);
            }
        }

        // raw: transaction.message.accountKeys: ["...", ...] (or [{ pubkey }])
        const message = (tx.transaction as Record<string, unknown> | undefined)?.message as
            | Record<string, unknown>
            | undefined;
        const accountKeys = message?.accountKeys ?? tx.accountKeys;
        if (Array.isArray(accountKeys)) {
            for (const key of accountKeys) {
                add(typeof key === 'string' ? key : (key as Record<string, unknown>)?.pubkey);
            }
        }
    }

    return [...addresses];
}

/** Process a delivery; returns how many pet rows were upserted. */
export async function handleHeliusWebhook(payload: unknown): Promise<{ updated: number }> {
    const { heliusRpcUrl, programId } = env.solana;
    if (!heliusRpcUrl || !programId) {
        throw new Error('Solana indexing not configured (HELIUS_RPC_URL / SOLANA_PROGRAM_ID)');
    }

    const addresses = extractAccountAddresses(payload);
    if (addresses.length === 0) {
        return { updated: 0 };
    }

    const rpc = createHeliusRpc(heliusRpcUrl, programId);
    const pets = await rpc.getPetsByAddresses(addresses);
    for (const pet of pets) {
        await upsertPet(pet);
    }

    return { updated: pets.length };
}
