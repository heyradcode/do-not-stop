// @ts-nocheck
//
// NOT RUN HERE: needs `anchor build` to generate `../target/types/cryptopets`,
// and no Rust/Anchor toolchain is available in the authoring environment.
// Program fixtures are loaded at genesis from `[[test.genesis]]` in
// Anchor.toml; see tests/fixtures/README.md for how to dump them.
//
// Covers the instructions that need no randomness: initialize, pause/unpause,
// the SetConfig setters, and withdraw_fees.
//
// WHY THE MINT AND BREED FLOWS ARE NOT COVERED, and what it would take.
//
// It is not missing test scaffolding. `commit_mint` calls
// `assert_randomness_committed`, which parses a real Switchboard
// `RandomnessAccountData` and requires `seed_slot == clock.slot - 1`;
// `settle_mint` calls `read_revealed_randomness`, which requires
// `data.get_value(clock.slot)` to succeed. That value is produced by a
// Switchboard oracle, and creating the account at all needs a Switchboard
// queue.
//
// The local validator this suite runs against has the Switchboard program
// loaded but no queue and no oracles, so `Randomness.create` has nothing to
// attach to and there is never a value to reveal. Loading a hand-built account
// at genesis does not work either: `seed_slot` must equal the previous slot,
// and a fixed value in a genesis account is only correct for one slot.
//
// Two real options, both decisions rather than chores:
//   1. Run these against devnet, where Switchboard's queue and oracles exist.
//      Costs devnet SOL per run and makes the suite network-dependent.
//   2. Build a mock Switchboard program exposing the same
//      `RandomnessAccountData` layout with a settable value, and load it at
//      the Switchboard address instead of the real one. This is what the EVM
//      side already does: Hardhat deploys `MockEntropy` and calls
//      `mockReveal(...)` because there is no live Pyth network locally.
//
// Option 2 matches existing practice and keeps the suite hermetic. Until one
// is chosen, the randomness-independent logic is covered by Rust unit tests in
// `programs/cryptopets/src/game/` and `src/state/` instead, which is where the
// arithmetic that a regression would actually break lives.
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cryptopets } from "../target/types/cryptopets";
import { expect } from "chai";
import { globalStatePda, feeVaultPda, fundAccount } from "./utils";

// mpl-core program (plan §2.3/v2.1 Phase A); loaded onto the local validator at
// genesis via Anchor.toml's [[test.genesis]].
const MPL_CORE_PROGRAM_ID = new anchor.web3.PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
);

describe("cryptopets", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.cryptopets as Program<Cryptopets>;
  const provider = anchor.getProvider();
  const wallet = provider.wallet as anchor.Wallet;

  const [globalState] = globalStatePda(program.programId);
  const [feeVault] = feeVaultPda(program.programId);

  describe("initialize", () => {
    it("creates global state with default config and the CryptoPets collection", async () => {
      const collection = anchor.web3.Keypair.generate();
      const levelUpFeeLamports = new anchor.BN(1_000_000);

      await program.methods
        .initialize(levelUpFeeLamports)
        .accounts({
          globalState,
          collection: collection.publicKey,
          admin: wallet.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
        })
        .signers([collection])
        .rpc();

      const gs = await program.account.globalState.fetch(globalState);
      expect(gs.admin.toBase58()).to.equal(wallet.publicKey.toBase58());
      expect(gs.collection.toBase58()).to.equal(collection.publicKey.toBase58());
      expect(gs.paused).to.be.false;
      // next_pet_id is a u32, which the Anchor client returns as a plain JS number
      // (not a BN), so compare directly rather than calling .toNumber().
      expect(gs.nextPetId).to.equal(1);
      expect(gs.levelUpFeeLamports.toString()).to.equal(levelUpFeeLamports.toString());
    });
  });

  describe("pause / unpause", () => {
    it("rejects pause/unpause from a non-admin signer", async () => {
      const attacker = anchor.web3.Keypair.generate();
      await fundAccount(provider, attacker.publicKey);

      let threw = false;
      try {
        await program.methods
          .pause()
          .accounts({ globalState, admin: attacker.publicKey })
          .signers([attacker])
          .rpc();
      } catch {
        threw = true;
      }
      expect(threw).to.be.true;
    });

    it("admin can pause and unpause", async () => {
      await program.methods.pause().accounts({ globalState, admin: wallet.publicKey }).rpc();

      let gs = await program.account.globalState.fetch(globalState);
      expect(gs.paused).to.be.true;

      await program.methods.unpause().accounts({ globalState, admin: wallet.publicKey }).rpc();

      gs = await program.account.globalState.fetch(globalState);
      expect(gs.paused).to.be.false;
    });
  });

  describe("config setters", () => {
    it("set_battle_cooldown_seconds applies a value within range", async () => {
      const value = new anchor.BN(3600);

      await program.methods
        .setBattleCooldownSeconds(value)
        .accounts({ globalState, admin: wallet.publicKey })
        .rpc();

      const gs = await program.account.globalState.fetch(globalState);
      expect(gs.battleCooldownSeconds.toString()).to.equal(value.toString());
    });

    it("set_battle_cooldown_seconds rejects values above MAX_BATTLE_COOLDOWN_SECONDS (InvalidBattleCooldown)", async () => {
      // MAX_BATTLE_COOLDOWN_SECONDS = 7 * 24 * 60 * 60 (state.rs)
      const tooLarge = new anchor.BN(7 * 24 * 60 * 60 + 1);

      let threw = false;
      try {
        await program.methods
          .setBattleCooldownSeconds(tooLarge)
          .accounts({ globalState, admin: wallet.publicKey })
          .rpc();
      } catch {
        threw = true;
      }
      expect(threw).to.be.true;
    });

    it("set_max_level rejects zero (InvalidMaxLevel)", async () => {
      let threw = false;
      try {
        await program.methods
          .setMaxLevel(0)
          .accounts({ globalState, admin: wallet.publicKey })
          .rpc();
      } catch {
        threw = true;
      }
      expect(threw).to.be.true;
    });
  });

  describe("withdraw_fees", () => {
    it("rejects withdrawing more than the fee vault balance (InsufficientFeeVaultBalance)", async () => {
      const vaultBalance = await provider.connection.getBalance(feeVault);

      let threw = false;
      try {
        await program.methods
          .withdrawFees(new anchor.BN(vaultBalance + 1))
          .accounts({ globalState, feeVault, admin: wallet.publicKey })
          .rpc();
      } catch {
        threw = true;
      }
      expect(threw).to.be.true;
    });
  });

  // TODO (plan §4.3/§4.4): gacha mint (commit_mint/settle_mint), breeding
  // (commit_breed/settle_breed), and everything downstream of an existing pet
  // (level_up, train, rename_pet, transfer_pet, marriage, cancel_mint/
  // cancel_breed, clear_stale_marriage, withdraw_stud_fees, sync_metadata).
  //
  // Every one of these needs a pet, and a pet only comes from settle_mint or
  // settle_breed minting a Metaplex Core asset after a Switchboard reveal. The
  // cancel_* paths are blocked for the same reason despite never reading a
  // revealed value: closing a stuck request needs a request, and only
  // commit_mint/commit_breed create one.
  //
  // So this is one blocker, not nine. Pick option 1 or 2 from the header and
  // the whole list unblocks together.
});
