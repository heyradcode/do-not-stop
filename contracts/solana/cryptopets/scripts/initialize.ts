#!/usr/bin/env tsx
//
// One-time on-chain setup for a freshly deployed `cryptopets` program: runs the
// `initialize` instruction, which creates the `global-state` PDA (admin + fee
// config + next_pet_id) and the Metaplex Core collection that every pet is
// minted into. Without this, mint/breed/battle and pet loading have nothing to
// read or write, so the frontend shows an empty list and create fails.
//
// Idempotent: if `global-state` already exists it prints the current config and
// exits without sending a transaction.
//
// Usage (devnet):
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=$HOME/.config/solana/id.json \
//   pnpm exec tsx scripts/initialize.ts
//
// The wallet must be the intended program admin and hold a little devnet SOL.

import * as anchor from "@coral-xyz/anchor";
import { globalStatePda } from "../tests/utils";

// Defaults to the program id pinned in Anchor.toml ([programs.devnet]); override
// with PROGRAM_ID=... if you deploy under a different key.
const PROGRAM_ID = new anchor.web3.PublicKey(
  process.env.PROGRAM_ID ?? "88HGagCw4i3BTMHEpdQy3YLeHrkTSKgXmvq66HJXKM7k",
);

// mpl-core program (stable across clusters). Required by the `initialize` CPI
// that creates the collection.
const MPL_CORE_PROGRAM_ID = new anchor.web3.PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
);

// Initial level-up fee in lamports; matches the test default. Tune via
// LEVEL_UP_FEE_LAMPORTS=... or adjust later with the `set_level_up_fee_lamports`
// admin instruction.
const LEVEL_UP_FEE_LAMPORTS = new anchor.BN(
  process.env.LEVEL_UP_FEE_LAMPORTS ?? 1_000_000,
);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;

  const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
  if (!idl) {
    throw new Error(
      `IDL not found on-chain for ${PROGRAM_ID.toBase58()}. Deploy the program and run \`anchor idl init\` first.`,
    );
  }
  const program = new anchor.Program(idl, provider);

  const [globalState] = globalStatePda(PROGRAM_ID);

  console.log("program   :", PROGRAM_ID.toBase58());
  console.log("admin     :", wallet.publicKey.toBase58());
  console.log("cluster   :", provider.connection.rpcEndpoint);
  console.log("globalState:", globalState.toBase58());

  const existing = await provider.connection.getAccountInfo(globalState);
  if (existing) {
    const gs = await (program.account as any).globalState.fetch(globalState);
    console.log("\n✅ Already initialized — nothing to do.");
    console.log("  collection :", gs.collection.toBase58());
    console.log("  admin      :", gs.admin.toBase58());
    console.log("  nextPetId  :", gs.nextPetId);
    console.log("  paused     :", gs.paused);
    return;
  }

  const collection = anchor.web3.Keypair.generate();
  console.log("\nInitializing… new collection:", collection.publicKey.toBase58());

  const sig = await program.methods
    .initialize(LEVEL_UP_FEE_LAMPORTS)
    .accounts({
      globalState,
      collection: collection.publicKey,
      admin: wallet.publicKey,
      mplCoreProgram: MPL_CORE_PROGRAM_ID,
    })
    .signers([collection])
    .rpc();

  console.log("\n✅ Initialized.");
  console.log("  tx         :", sig);
  console.log("  collection :", collection.publicKey.toBase58());
  console.log(
    "\nSave the collection address — it lives in global-state and is used by",
    "every mint/sync. No env change is needed; the frontend reads it on-chain.",
  );
}

main().catch((err) => {
  console.error("\n❌ initialize failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
