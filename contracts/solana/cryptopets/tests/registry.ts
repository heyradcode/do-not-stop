// @ts-nocheck
//
// NOT RUN HERE: needs `anchor build` to generate
// `../target/types/cryptopets_registry`, and no Rust/Anchor toolchain is
// available in the authoring environment.
//
// Unlike the mint and breed flows in cryptopets.ts, nothing in this suite is
// blocked: the registry has no randomness dependency, no oracle, and no CPI.
// Every case below runs against a bare local validator.
//
// Ordering matters. The registry head is one PDA per program, so `initialize`
// happens once and the batch chain advances across tests. Cases that must run
// against a known head say so.
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CryptopetsRegistry } from "../target/types/cryptopets_registry";
import { expect } from "chai";
import {
  batchPda,
  expectError,
  fundAccount,
  publisherPda,
  registryPda,
  root,
  ZERO_ROOT,
} from "./utils";

describe("cryptopets-registry", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.cryptopetsRegistry as Program<CryptopetsRegistry>;
  const provider = anchor.getProvider();
  const wallet = provider.wallet as anchor.Wallet;

  const [registry] = registryPda(program.programId);
  const [publisherRecord] = publisherPda(program.programId, wallet.publicKey);

  const RULESET_SET = root(0xaa);

  /** Publishes batch `n` covering `[first, last]`, chaining from `previousRoot`. */
  function publish(
    n: number,
    previousRoot: number[],
    merkleRoot: number[],
    first: number,
    last: number,
    signer = wallet.publicKey,
    signers: anchor.web3.Keypair[] = [],
  ) {
    const [batch] = batchPda(program.programId, n);
    const [record] = publisherPda(program.programId, signer);
    const call = program.methods
      .publishBatch(
        new anchor.BN(n),
        previousRoot,
        merkleRoot,
        RULESET_SET,
        new anchor.BN(first),
        new anchor.BN(last),
      )
      .accounts({
        registry,
        publisher: signer,
        publisherRecord: record,
        batch,
        systemProgram: anchor.web3.SystemProgram.programId,
      });
    return signers.length ? call.signers(signers).rpc() : call.rpc();
  }

  describe("initialize", () => {
    it("creates the head with a zero root and no batches", async () => {
      await program.methods
        .initialize()
        .accounts({
          registry,
          admin: wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const state = await program.account.registryState.fetch(registry);
      expect(state.admin.toBase58()).to.equal(wallet.publicKey.toBase58());
      expect(state.latestBatchNumber.toNumber()).to.equal(0);
      expect(state.latestLastSequence.toNumber()).to.equal(0);
      expect([...state.latestRoot]).to.deep.equal(ZERO_ROOT);
      expect(state.paused).to.be.false;
    });
  });

  describe("publisher authorization", () => {
    it("refuses to publish before the signer is authorized", async () => {
      // No publisher_record account exists yet, so it cannot deserialize.
      await expectError(publish(1, ZERO_ROOT, root(0x11), 1, 100));
    });

    it("rejects authorize_publisher from a non-admin", async () => {
      const attacker = anchor.web3.Keypair.generate();
      await fundAccount(provider, attacker.publicKey);
      const [record] = publisherPda(program.programId, attacker.publicKey);

      await expectError(
        program.methods
          .authorizePublisher()
          .accounts({
            registry,
            admin: attacker.publicKey,
            publisher: attacker.publicKey,
            publisherRecord: record,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([attacker])
          .rpc(),
        "Unauthorized",
      );
    });

    it("admin authorizes a publisher", async () => {
      await program.methods
        .authorizePublisher()
        .accounts({
          registry,
          admin: wallet.publicKey,
          publisher: wallet.publicKey,
          publisherRecord,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const record = await program.account.publisher.fetch(publisherRecord);
      expect(record.publisher.toBase58()).to.equal(wallet.publicKey.toBase58());
    });
  });

  describe("publish_batch", () => {
    it("publishes the first batch against the zero root", async () => {
      await publish(1, ZERO_ROOT, root(0x11), 1, 100);

      const state = await program.account.registryState.fetch(registry);
      expect(state.latestBatchNumber.toNumber()).to.equal(1);
      expect([...state.latestRoot]).to.deep.equal(root(0x11));
      expect(state.latestLastSequence.toNumber()).to.equal(100);

      const [addr] = batchPda(program.programId, 1);
      const batch = await program.account.batch.fetch(addr);
      expect([...batch.previousRoot]).to.deep.equal(ZERO_ROOT);
      expect([...batch.merkleRoot]).to.deep.equal(root(0x11));
      expect(batch.firstSequence.toNumber()).to.equal(1);
      expect(batch.lastSequence.toNumber()).to.equal(100);
      // Cluster time, not an operator-supplied value: it must be a real timestamp.
      expect(batch.publishedAt.toNumber()).to.be.greaterThan(0);
    });

    it("rejects a batch number that is not exactly the next one", async () => {
      await expectError(publish(3, root(0x11), root(0x22), 101, 200), "WrongBatchNumber");
    });

    it("rejects a previous_root that is not the current head", async () => {
      await expectError(publish(2, root(0x99), root(0x22), 101, 200), "WrongPreviousRoot");
    });

    it("rejects the zero root", async () => {
      await expectError(publish(2, root(0x11), ZERO_ROOT, 101, 200), "EmptyRoot");
    });

    it("rejects an inverted sequence range", async () => {
      await expectError(publish(2, root(0x11), root(0x22), 200, 101), "BadSequenceRange");
    });

    // The check that turns "we published some receipts" into "we published all of them,
    // in order, or the transaction failed".
    it("rejects a gap between batches", async () => {
      await expectError(
        publish(2, root(0x11), root(0x22), 102, 200),
        "SequenceNotContiguous",
      );
    });

    it("accepts the next batch and links the chain", async () => {
      await publish(2, root(0x11), root(0x22), 101, 200);

      const state = await program.account.registryState.fetch(registry);
      expect(state.latestBatchNumber.toNumber()).to.equal(2);
      expect([...state.latestRoot]).to.deep.equal(root(0x22));
      expect(state.latestLastSequence.toNumber()).to.equal(200);

      const [addr] = batchPda(program.programId, 2);
      const batch = await program.account.batch.fetch(addr);
      // Batch 2 names batch 1's root, which is what makes the chain append-only.
      expect([...batch.previousRoot]).to.deep.equal(root(0x11));
    });

    // Belt and braces: the head check refuses this, and `init` on the batch PDA makes it
    // impossible independently of any check the handler could later relax.
    it("cannot republish a batch number", async () => {
      await expectError(publish(1, ZERO_ROOT, root(0x11), 1, 100));
    });

    it("rejects a signer whose authorization was revoked", async () => {
      const other = anchor.web3.Keypair.generate();
      await fundAccount(provider, other.publicKey);
      const [record] = publisherPda(program.programId, other.publicKey);

      await program.methods
        .authorizePublisher()
        .accounts({
          registry,
          admin: wallet.publicKey,
          publisher: other.publicKey,
          publisherRecord: record,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .revokePublisher()
        .accounts({
          registry,
          admin: wallet.publicKey,
          publisher: other.publicKey,
          publisherRecord: record,
        })
        .rpc();

      // Closing the account is the revocation, so this fails to deserialize it.
      await expectError(
        publish(3, root(0x22), root(0x33), 201, 300, other.publicKey, [other]),
      );
    });
  });

  describe("pause", () => {
    it("rejects pause from a non-admin", async () => {
      const attacker = anchor.web3.Keypair.generate();
      await fundAccount(provider, attacker.publicKey);

      await expectError(
        program.methods
          .pause()
          .accounts({ registry, admin: attacker.publicKey })
          .signers([attacker])
          .rpc(),
        "Unauthorized",
      );
    });

    it("blocks publication while paused and resumes where it left off", async () => {
      await program.methods.pause().accounts({ registry, admin: wallet.publicKey }).rpc();

      await expectError(publish(3, root(0x22), root(0x33), 201, 300), "Paused");

      await program.methods.unpause().accounts({ registry, admin: wallet.publicKey }).rpc();

      // Same arguments succeed: pausing rejected the batch, it did not consume it.
      await publish(3, root(0x22), root(0x33), 201, 300);

      const state = await program.account.registryState.fetch(registry);
      expect(state.latestBatchNumber.toNumber()).to.equal(3);
      expect(state.latestLastSequence.toNumber()).to.equal(300);
    });
  });

  // Rotation is the only recovery path once the upgrade authority is burned, so it has to
  // work and it has to be admin-gated.
  describe("set_admin", () => {
    it("rejects set_admin from a non-admin", async () => {
      const attacker = anchor.web3.Keypair.generate();
      await fundAccount(provider, attacker.publicKey);

      await expectError(
        program.methods
          .setAdmin(attacker.publicKey)
          .accounts({ registry, admin: attacker.publicKey })
          .signers([attacker])
          .rpc(),
        "Unauthorized",
      );
    });

    it("hands the role over, and the old admin loses it", async () => {
      const next = anchor.web3.Keypair.generate();
      await fundAccount(provider, next.publicKey);

      await program.methods
        .setAdmin(next.publicKey)
        .accounts({ registry, admin: wallet.publicKey })
        .rpc();

      let state = await program.account.registryState.fetch(registry);
      expect(state.admin.toBase58()).to.equal(next.publicKey.toBase58());

      await expectError(
        program.methods.pause().accounts({ registry, admin: wallet.publicKey }).rpc(),
        "Unauthorized",
      );

      // Hand it back, so a later test file sharing this validator is not left locked out.
      await program.methods
        .setAdmin(wallet.publicKey)
        .accounts({ registry, admin: next.publicKey })
        .signers([next])
        .rpc();

      state = await program.account.registryState.fetch(registry);
      expect(state.admin.toBase58()).to.equal(wallet.publicKey.toBase58());
    });
  });
});
