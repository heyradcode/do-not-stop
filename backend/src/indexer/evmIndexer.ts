import { ethers } from 'ethers';
import { CRYPTOPETS_ABI, type CryptoPetsReader } from './abi';
import { upsertPet } from './rosterRepository';

export interface EvmIndexerConfig {
    rpcUrl: string;
    contractAddress: string;
}

/**
 * Full re-scan of the CryptoPets contract into `pet_roster`.
 *
 * Walks token ids `1..getTotalCount()`, reading owner + struct for each, and
 * upserts every pet. Owners are lowercased so the matchmaking endpoint's
 * `owner != caller` exclusion matches the JWT address (also lowercased).
 *
 * This is the simple "timer scan" version (PVP_BATTLE.md §2.2 step 3). It can be
 * upgraded to event-driven incremental updates later.
 */
export async function scanEvmRoster(
    config: EvmIndexerConfig
): Promise<{ total: number; scanned: number }> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(
        config.contractAddress,
        CRYPTOPETS_ABI,
        provider
    ) as unknown as ethers.Contract & CryptoPetsReader;

    const total = Number(await contract.getTotalCount());
    let scanned = 0;

    for (let id = 1; id <= total; id++) {
        const tokenId = BigInt(id);
        try {
            const [owner, pet] = await Promise.all([
                contract.ownerOf(tokenId),
                contract.getById(tokenId),
            ]);

            await upsertPet({
                chain: 'evm',
                petId: String(id),
                owner: owner.toLowerCase(),
                name: pet.name,
                level: Number(pet.level),
                rarity: Number(pet.rarity),
                dna: pet.dna.toString(),
                winCount: Number(pet.winCount),
                lossCount: Number(pet.lossCount),
                readyAt: BigInt(pet.readyTime),
            });
            scanned++;
        } catch (err) {
            // Skip burned/unreadable ids without aborting the whole scan.
            console.warn(`[indexer] evm pet ${id} skipped: ${(err as Error).message}`);
        }
    }

    return { total, scanned };
}
