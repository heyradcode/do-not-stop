// @ts-nocheck
//
// NOT RUN: requires `anchor build` (Rust/Anchor toolchain unavailable in this
// environment) to generate `../target/types/cryptopets`, plus a local
// validator with the Metaplex Core and Switchboard On-Demand programs cloned
// (see Anchor.toml's `[test.validator]` -- those program addresses are
// UNVERIFIED, confirm before running `anchor test`).
//
// Covers the v2 instruction set (plan-contract-upgrade.md) that doesn't
// depend on a Switchboard On-Demand randomness commit/reveal cycle:
// initialize, pause/unpause, and the SetConfig setters. The gacha mint and
// breed flows -- and anything downstream of them (pets, marriage, fee
// withdrawals) -- require minting a randomness account and
// driving it through Switchboard's on-chain commit/reveal, which needs the
// `@switchboard-xyz/on-demand` JS SDK wired into the local validator; that
// infrastructure doesn't exist yet, so those flows aren't covered here.
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cryptopets } from "../target/types/cryptopets";
import { expect } from "chai";
import { globalStatePda, feeVaultPda, fundAccount } from "./utils";

// mpl-core program (plan §2.3/v2.1 Phase A); cloned onto the local validator
// via Anchor.toml's [test.validator]. UNVERIFIED address, see note above.
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
  // (commit_breed/settle_breed), and everything that depends on an existing pet
  // (level_up, train, rename_pet, marriage,
  // cancel_mint/cancel_breed, clear_stale_marriage, withdraw_stud_fees,
  // sync_metadata). All of these
  // need a pet, which only comes from settle_mint/settle_breed minting a
  // Metaplex Core asset after a Switchboard On-Demand randomness reveal --
  // build that test harness (Randomness.create/commitIx/revealIx from
  // @switchboard-xyz/on-demand) before adding coverage here.
});
