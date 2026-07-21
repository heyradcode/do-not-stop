#!/usr/bin/env tsx
//
// Devnet-only integration check for Workstream S1 (BattleRequest snapshot) and S2
// (permissionless settle_battle) from ../../../docs/plan-realtime-battle-solana.md.
//
// WHY DEVNET, NOT `anchor test`'S LOCAL VALIDATOR: Switchboard On-Demand has no
// local-validator path at all. `getDefaultQueue()` only resolves real mainnet/devnet
// queue accounts, and `revealIx()` calls out to a live Switchboard gateway (an actual
// internet-connected oracle operator) to get a signed reveal -- neither exists on a
// fresh local validator, genesis-loaded program bytecode notwithstanding. This script
// lives outside `tests/` on purpose so `anchor test`'s `tests/**/*.ts` glob never picks
// it up; it is meant to be run manually, not as part of CI.
//
// WHAT THIS PROVES:
//   S1 - fetches the BattleRequest account right after commit_battle, then calls
//        level_up on the attacker's pet, then fetches BattleRequest again and asserts
//        its snapshotted attacker_level is UNCHANGED while the live PetAccount's level
//        HAS changed -- direct on-chain proof that settle_battle simulates from the
//        frozen snapshot, not the live (rerollable) pet stats.
//   S2 - submits settle_battle from a third keypair, unrelated to either battler, as
//        fee payer/signer -- proving the instruction is genuinely permissionless (a
//        backend keeper needs no player signature).
//
// WHAT THIS DOES NOT COVER: the combat math itself (that's the golden vectors, run
// identically by Hardhat/Anchor/indexer-go/vitest -- see CLAUDE.md's "Combat simulator"
// section) and the client-side live-animation reveal-decode trick in
// shared/src/hooks/chains/solana/useLiveBattleReplaySolana.ts (that needs its own
// live-gateway check from the frontend/browser side; see that file's header comment).
//
// COST / SAFETY: this WRITES real on-chain state (two minted pets, a battle, a
// level-up) to whatever program id it's pointed at, and spends real (free-faucet)
// devnet SOL, all funded from the one ANCHOR_WALLET keypair. Do NOT point PROGRAM_ID
// at a program other players or the live demo also use unless you accept that --
// prefer a dedicated devnet deployment for repeated runs.
//
// Usage:
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=$HOME/.config/solana/id.json \
//   pnpm exec tsx scripts/devnet-battle-harness.ts
//
// ANCHOR_WALLET must hold enough devnet SOL to fund itself plus two fresh throwaway
// keypairs it creates and transfers to directly (defender, keeper) -- at least ~1.5
// SOL total is a safe margin. It does not rely on requestAirdrop for the throwaway
// keypairs (devnet airdrops are rate-limited and unreliable); it transfers from
// ANCHOR_WALLET instead, so only that one wallet needs pre-funding (faucet.solana.com).
//
// NOT RUN in this environment: no cargo/anchor/rustc/solana toolchain, and no
// reachable network here (confirmed: even `pnpm add` to the npm registry timed out).
// Written from reading the program source and the existing tests/scripts directly,
// not executed. Run this yourself before trusting it.

import * as anchor from "@coral-xyz/anchor";
import { EventParser } from "@coral-xyz/anchor";
import * as sb from "@switchboard-xyz/on-demand";
import {
  globalStatePda,
  playerProfilePda,
  petPda,
  mintRequestPda,
  battleRequestPda,
  feeVaultPda,
} from "../tests/utils";

const PROGRAM_ID = new anchor.web3.PublicKey(
  process.env.PROGRAM_ID ?? "EVzXwxHqwbTLMxfTG3amCb2Sjwmy5A7hqR59GbrvEyV1"
);
const MPL_CORE_PROGRAM_ID = new anchor.web3.PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
);

const REVEAL_RETRIES = 10;
const REVEAL_BACKOFF_MS = 3_000;

async function waitForReveal(
  randomness: Awaited<ReturnType<typeof sb.Randomness.create>>[0],
  payer: anchor.web3.PublicKey
): Promise<anchor.web3.TransactionInstruction> {
  for (let attempt = 1; attempt <= REVEAL_RETRIES; attempt++) {
    try {
      return await randomness.revealIx(payer);
    } catch (err) {
      if (attempt === REVEAL_RETRIES) throw err;
      console.log(
        `  oracle not ready yet (attempt ${attempt}/${REVEAL_RETRIES}), retrying…`
      );
      await new Promise((r) => setTimeout(r, REVEAL_BACKOFF_MS));
    }
  }
  throw new Error("unreachable");
}

async function transferSol(
  provider: anchor.AnchorProvider,
  from: anchor.web3.Keypair,
  to: anchor.web3.PublicKey,
  lamports: number
): Promise<void> {
  const tx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports,
    })
  );
  const sig = await provider.connection.sendTransaction(tx, [from]);
  await provider.connection.confirmTransaction(sig, "confirmed");
}

async function mintPet(
  program: anchor.Program,
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  name: string
): Promise<{ asset: anchor.web3.PublicKey; petId: number }> {
  const [globalState] = globalStatePda(PROGRAM_ID);
  const [playerProfile] = playerProfilePda(PROGRAM_ID, owner.publicKey);
  const [mintRequest] = mintRequestPda(PROGRAM_ID, owner.publicKey);
  const [feeVault] = feeVaultPda(PROGRAM_ID);

  const gs = await (program.account as any).globalState.fetch(globalState);
  const collection = gs.collection as anchor.web3.PublicKey;

  const queue = await sb.getDefaultQueue(provider.connection.rpcEndpoint);
  const rngKp = anchor.web3.Keypair.generate();
  const [randomness, createIx] = await sb.Randomness.create(
    queue.program,
    rngKp,
    queue.pubkey,
    owner.publicKey
  );
  const commitIx = await randomness.commitIx(queue.pubkey, owner.publicKey);
  const commitMintIx = await program.methods
    .commitMint(rngKp.publicKey, name)
    .accounts({
      globalState,
      owner: owner.publicKey,
      playerProfile,
      mintRequest,
      feeVault,
      randomnessAccountData: rngKp.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();

  const commitTx = await sb.asV0Tx({
    connection: provider.connection,
    ixs: [createIx, commitIx, commitMintIx],
    payer: owner.publicKey,
    computeUnitPrice: 75_000,
    computeUnitLimitMultiple: 1.3,
  });
  commitTx.sign([owner, rngKp]);
  const commitSig = await provider.connection.sendTransaction(commitTx);
  await provider.connection.confirmTransaction(commitSig, "confirmed");
  console.log(`  [${name}] commit_mint: ${commitSig}`);

  const revealIx = await waitForReveal(randomness, owner.publicKey);

  const assetKp = anchor.web3.Keypair.generate();
  const [pet] = petPda(PROGRAM_ID, assetKp.publicKey);

  const settleMintIx = await program.methods
    .settleMint()
    .accounts({
      globalState,
      owner: owner.publicKey,
      mplCoreProgram: MPL_CORE_PROGRAM_ID,
      asset: assetKp.publicKey,
      collection,
      pet,
      mintRequest,
      randomnessAccountData: rngKp.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();

  const settleTx = await sb.asV0Tx({
    connection: provider.connection,
    ixs: [revealIx, settleMintIx],
    payer: owner.publicKey,
    computeUnitPrice: 75_000,
    computeUnitLimitMultiple: 1.3,
  });
  settleTx.sign([owner, assetKp]);
  const settleSig = await provider.connection.sendTransaction(settleTx);
  await provider.connection.confirmTransaction(settleSig, "confirmed");
  console.log(`  [${name}] settle_mint: ${settleSig}`);

  const petAccount = await (program.account as any).petAccount.fetch(pet);
  return { asset: assetKp.publicKey, petId: petAccount.id };
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const attacker = (provider.wallet as anchor.Wallet).payer;

  const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
  if (!idl) {
    throw new Error(
      `IDL not found on-chain for ${PROGRAM_ID.toBase58()}. Deploy the program and run ` +
        "`anchor idl init` first."
    );
  }
  const program = new anchor.Program(idl, provider);

  const [globalState] = globalStatePda(PROGRAM_ID);
  const gsInfo = await provider.connection.getAccountInfo(globalState);
  if (!gsInfo) {
    throw new Error(
      `global-state doesn't exist for ${PROGRAM_ID.toBase58()}. Run scripts/initialize.ts first.`
    );
  }

  console.log("program  :", PROGRAM_ID.toBase58());
  console.log("cluster  :", provider.connection.rpcEndpoint);
  console.log("attacker :", attacker.publicKey.toBase58());
  console.log(
    "\n⚠ This writes real state to the program above and spends real (free-faucet)",
    "devnet SOL. Ctrl-C now if that program is shared with other players or the live demo.\n"
  );

  const defender = anchor.web3.Keypair.generate();
  const keeper = anchor.web3.Keypair.generate();
  console.log(
    "defender :",
    defender.publicKey.toBase58(),
    "(fresh, funded from attacker)"
  );
  console.log(
    "keeper   :",
    keeper.publicKey.toBase58(),
    "(fresh, funded from attacker)"
  );
  await transferSol(
    provider,
    attacker,
    defender.publicKey,
    0.3 * anchor.web3.LAMPORTS_PER_SOL
  );
  await transferSol(
    provider,
    attacker,
    keeper.publicKey,
    0.05 * anchor.web3.LAMPORTS_PER_SOL
  );

  console.log("\nMinting attacker pet…");
  const attackerPet = await mintPet(
    program,
    provider,
    attacker,
    "Harness Attacker"
  );
  console.log("Minting defender pet…");
  const defenderPet = await mintPet(
    program,
    provider,
    defender,
    "Harness Defender"
  );

  const [attackerPetPda] = petPda(PROGRAM_ID, attackerPet.asset);
  const [defenderPetPda] = petPda(PROGRAM_ID, defenderPet.asset);
  const [battleRequest] = battleRequestPda(PROGRAM_ID, attacker.publicKey);

  console.log("\nCommitting battle…");
  const queue = await sb.getDefaultQueue(provider.connection.rpcEndpoint);
  const rngKp = anchor.web3.Keypair.generate();
  const [randomness, createIx] = await sb.Randomness.create(
    queue.program,
    rngKp,
    queue.pubkey,
    attacker.publicKey
  );
  const commitIx = await randomness.commitIx(queue.pubkey, attacker.publicKey);
  const commitBattleIx = await program.methods
    .commitBattle(rngKp.publicKey)
    .accounts({
      globalState,
      attackerOwner: attacker.publicKey,
      attackerAsset: attackerPet.asset,
      attackerPet: attackerPetPda,
      defenderOwner: defender.publicKey,
      defenderAsset: defenderPet.asset,
      defenderPet: defenderPetPda,
      battleRequest,
      randomnessAccountData: rngKp.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();
  const commitBattleTx = await sb.asV0Tx({
    connection: provider.connection,
    ixs: [createIx, commitIx, commitBattleIx],
    payer: attacker.publicKey,
    computeUnitPrice: 75_000,
    computeUnitLimitMultiple: 1.3,
  });
  commitBattleTx.sign([attacker, rngKp]);
  const commitBattleSig = await provider.connection.sendTransaction(
    commitBattleTx
  );
  await provider.connection.confirmTransaction(commitBattleSig, "confirmed");
  console.log("  commit_battle:", commitBattleSig);

  // --- S1 check ---
  const requestBeforeLevelUp = await (
    program.account as any
  ).battleRequest.fetch(battleRequest);
  const petBeforeLevelUp = await (program.account as any).petAccount.fetch(
    attackerPetPda
  );
  console.log(
    `\nS1 check: battle_request.attackerLevel=${requestBeforeLevelUp.attackerLevel}`,
    `live pet.level=${petBeforeLevelUp.level} (expected equal here, before level_up)`
  );

  console.log(
    "Leveling up the attacker's pet (simulating the front-run reroll attempt)…"
  );
  const [feeVault] = feeVaultPda(PROGRAM_ID);
  await program.methods
    .levelUp()
    .accounts({
      globalState,
      petAsset: attackerPet.asset,
      pet: attackerPetPda,
      feeVault,
      owner: attacker.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([attacker])
    .rpc();

  const requestAfterLevelUp = await (
    program.account as any
  ).battleRequest.fetch(battleRequest);
  const petAfterLevelUp = await (program.account as any).petAccount.fetch(
    attackerPetPda
  );
  console.log(
    `S1 check: battle_request.attackerLevel=${requestAfterLevelUp.attackerLevel}`,
    `(must be unchanged) live pet.level=${petAfterLevelUp.level} (must be +1)`
  );
  if (
    requestAfterLevelUp.attackerLevel !== requestBeforeLevelUp.attackerLevel
  ) {
    throw new Error(
      "S1 FAILED: battle_request's frozen attackerLevel changed after level_up -- the " +
        "snapshot fix is not behaving as designed."
    );
  }
  if (petAfterLevelUp.level !== petBeforeLevelUp.level + 1) {
    throw new Error(
      "level_up did not increment the live pet's level as expected -- check the setup, not S1 itself."
    );
  }
  if (requestAfterLevelUp.attackerLevel === petAfterLevelUp.level) {
    throw new Error(
      "S1 INCONCLUSIVE: snapshot level equals live level after level_up -- the two should " +
        "have diverged; this run didn't actually exercise the fix."
    );
  }
  console.log(
    "✅ S1: the frozen snapshot is unaffected by the live (now leveled-up) pet account.\n"
  );

  // --- S2 check ---
  console.log("Waiting for Switchboard reveal…");
  const revealIx = await waitForReveal(randomness, keeper.publicKey);

  console.log(
    "Settling battle from the unrelated keeper wallet (proves permissionless settle)…"
  );
  const settleBattleIx = await program.methods
    .settleBattle()
    .accounts({
      globalState,
      attackerOwner: attacker.publicKey,
      attackerAsset: attackerPet.asset,
      attackerPet: attackerPetPda,
      defenderOwner: defender.publicKey,
      defenderAsset: defenderPet.asset,
      defenderPet: defenderPetPda,
      battleRequest,
      randomnessAccountData: rngKp.publicKey,
    })
    .instruction();
  const settleBattleTx = await sb.asV0Tx({
    connection: provider.connection,
    ixs: [revealIx, settleBattleIx],
    payer: keeper.publicKey,
    computeUnitPrice: 75_000,
    computeUnitLimitMultiple: 1.3,
  });
  settleBattleTx.sign([keeper]);
  const settleBattleSig = await provider.connection.sendTransaction(
    settleBattleTx
  );
  await provider.connection.confirmTransaction(settleBattleSig, "confirmed");
  console.log(
    "  settle_battle:",
    settleBattleSig,
    "(signed only by the keeper, not the attacker)"
  );
  console.log(
    "✅ S2: settle_battle succeeded without the attacker's signature.\n"
  );

  const tx = await provider.connection.getTransaction(settleBattleSig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const logs = tx?.meta?.logMessages ?? [];
  const parser = new EventParser(program.programId, program.coder);
  for (const event of parser.parseLogs(logs)) {
    if (event.name === "BattleResolved") {
      console.log("BattleResolved event:", event.data);
    }
  }

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(
    "\n❌ harness failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
