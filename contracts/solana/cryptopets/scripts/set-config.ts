#!/usr/bin/env tsx
//
// Admin helper: calls any single-value config setter on the deployed `cryptopets` program.
//
// Usage (devnet):
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=$HOME/.config/solana/id.json \
//   pnpm exec tsx scripts/set-config.ts proposalTtlSeconds 86400
//
// Available keys (all durations in seconds, fees in lamports):
//   proposalTtlSeconds      — how long a marriage proposal stays open (default: 60, max: 604800)
//   marriageCooldownSeconds — cooldown after divorce before re-proposing (default: 60)
//   battleCooldownSeconds   — cooldown between battles (default: 5)
//   trainCooldownSeconds    — cooldown between trains (default: 60)
//   trainXp                 — XP granted per train (default: 100)
//   levelBandWidth          — retired with the on-chain battle path; nothing reads it
//   maxLevel                — hard level cap (default: 100)
//   generationCap           — max breeding generation (default: 20)
//   newbornCooldownSeconds  — post-breed battle lockout (default: 60)
//   breedCooldownBaseSeconds — base breed cooldown, doubles per breed_count (default: 5)
//   levelUpFeeLamports      — fee per level-up (default: 1_000_000)
//   baseMintFeeLamports     — base gacha mint fee, escalates per wallet (default: 20_000_000)
//   breedFeeLamports        — fee per breed commit (default: 10_000_000)
//   studFeeLamports         — stud fee for cross-owner breed (default: 20_000_000)
//   trainFeeLamports        — base train fee, scales with level (default: 10_000_000)

import * as anchor from "@coral-xyz/anchor";
import { globalStatePda } from "../tests/utils";

const PROGRAM_ID = new anchor.web3.PublicKey(
  process.env.PROGRAM_ID ?? "EVzXwxHqwbTLMxfTG3amCb2Sjwmy5A7hqR59GbrvEyV1",
);

const KEY_TO_INSTRUCTION: Record<string, string> = {
  proposalTtlSeconds: "setProposalTtlSeconds",
  marriageCooldownSeconds: "setMarriageCooldownSeconds",
  battleCooldownSeconds: "setBattleCooldownSeconds",
  trainCooldownSeconds: "setTrainCooldownSeconds",
  trainXp: "setTrainXp",
  levelBandWidth: "setLevelBandWidth",
  maxLevel: "setMaxLevel",
  generationCap: "setGenerationCap",
  newbornCooldownSeconds: "setNewbornCooldownSeconds",
  breedCooldownBaseSeconds: "setBreedCooldownBaseSeconds",
  levelUpFeeLamports: "setLevelUpFeeLamports",
  baseMintFeeLamports: "setBaseMintFeeLamports",
  breedFeeLamports: "setBreedFeeLamports",
  studFeeLamports: "setStudFeeLamports",
  trainFeeLamports: "setTrainFeeLamports",
};

async function main() {
  const [key, rawValue] = process.argv.slice(2);

  if (!key || rawValue === undefined) {
    console.error("Usage: tsx scripts/set-config.ts <key> <value>");
    console.error("Example: tsx scripts/set-config.ts proposalTtlSeconds 86400");
    console.error("\nAvailable keys:", Object.keys(KEY_TO_INSTRUCTION).join(", "));
    process.exit(1);
  }

  const instructionName = KEY_TO_INSTRUCTION[key];
  if (!instructionName) {
    console.error(`Unknown key: "${key}". Available: ${Object.keys(KEY_TO_INSTRUCTION).join(", ")}`);
    process.exit(1);
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) {
    console.error(`Value must be a non-negative number, got: "${rawValue}"`);
    process.exit(1);
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;

  const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
  if (!idl) {
    throw new Error(`IDL not found on-chain for ${PROGRAM_ID.toBase58()}.`);
  }
  const program = new anchor.Program(idl, provider);
  const [globalState] = globalStatePda(PROGRAM_ID);

  const gs = await (program.account as any).globalState.fetch(globalState);

  console.log("program    :", PROGRAM_ID.toBase58());
  console.log("admin      :", wallet.publicKey.toBase58());
  console.log("cluster    :", provider.connection.rpcEndpoint);
  console.log(`setting    : ${key} = ${value} (current: ${gs[key] ?? "?"})`)

  const methods = program.methods as any;
  if (typeof methods[instructionName] !== "function") {
    throw new Error(`Instruction "${instructionName}" not found in IDL. Is the program up-to-date?`);
  }

  const bnValue = new anchor.BN(value);
  const sig = await methods[instructionName](bnValue)
    .accounts({ globalState, admin: wallet.publicKey })
    .rpc();

  console.log("\n✅ Done. tx:", sig);

  const updated = await (program.account as any).globalState.fetch(globalState);
  console.log(`   ${key} is now: ${updated[key]}`);
}

main().catch((err) => {
  console.error("\n❌ set-config failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
