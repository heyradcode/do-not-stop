/**
 * Solana roster indexer — NOT YET IMPLEMENTED.
 *
 * Approach (PVP_BATTLE.md §2.3), to implement when adding Solana to PvP:
 *   1. Add `@coral-xyz/anchor` + `@solana/web3.js` to the backend.
 *   2. Build an AnchorProvider with a read-only wallet, then
 *      `idl = await Program.fetchIdl(programId, provider)` (the IDL is published
 *      on-chain — same path `shared/src/hooks/chains/solana/useProgram.ts` uses).
 *   3. `const pets = await program.account.petAccount.all()` to enumerate every
 *      PetAccount, decode (id, owner, dna, rarity, level, readyTime, win/loss,
 *      name/nameLen — see `shared/src/utils/pets/mapSolanaPet.ts`).
 *   4. `upsertPet({ chain: 'solana', petId: String(id), owner: owner.toBase58(), ... })`.
 *
 * Requires the local validator to have the program AND its IDL deployed.
 */
export interface SolanaIndexerConfig {
    rpcUrl: string;
    programId: string;
}

export async function scanSolanaRoster(
    _config: SolanaIndexerConfig
): Promise<{ total: number; scanned: number }> {
    throw new Error('Solana indexer not implemented yet (see PVP_BATTLE.md §2.3)');
}
