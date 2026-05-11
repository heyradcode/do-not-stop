// @ts-nocheck
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cryptopets } from "../target/types/cryptopets";
import { expect } from "chai";

describe("cryptopets", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.cryptopets as Program<Cryptopets>;

  it("initializes global state", async () => {
    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId,
    );

    const tx = await program.methods
      .initialize(new anchor.BN(1_000_000))
      .accounts({
        globalState,
      })
      .rpc();

    console.log("initialized tx", tx);

    // fetch and assert global state fields
    const gs = await (program as any).account.globalState.fetch(globalState);
    // basic existence checks
    expect(gs).to.not.be.null;
    expect(gs.admin).to.exist;
  });

  it("creates starter zombie", async () => {
    const provider = anchor.getProvider();
    const wallet = provider.wallet as anchor.Wallet;

    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId,
    );

    const [playerProfile] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("player-profile"), wallet.publicKey.toBuffer()],
      program.programId,
    );

    const [zombie] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("zombie"),
        wallet.publicKey.toBuffer(),
        new anchor.BN(1).toArrayLike(Buffer, "le", 4),
      ],
      program.programId,
    );

    const tx = await program.methods
      .createStarterZombie("Starter", new anchor.BN(12345), 1)
      .accounts({
        globalState,
        playerProfile,
        zombie,
        owner: wallet.publicKey,
      })
      .rpc();

    console.log("starter zombie tx", tx);

    // verify player profile and zombie accounts
    const pp = await (program as any).account.playerProfile.fetch(playerProfile);
    expect(pp).to.not.be.null;
    // owner stored as Pubkey
    expect(pp.owner?.toBase58 ? pp.owner.toBase58() : pp.owner).to.equal(wallet.publicKey.toBase58());
    expect(pp.starter_created ?? pp.starterCreated).to.be.ok;

    const z = await (program as any).account.zombieAccount.fetch(zombie);
    expect(z).to.not.be.null;
    expect(z.owner?.toBase58 ? z.owner.toBase58() : z.owner).to.equal(wallet.publicKey.toBase58());
    expect(Number(z.level)).to.be.gte(1);
  });

  it("levels up a zombie", async () => {
    const provider = anchor.getProvider();
    const wallet = provider.wallet as anchor.Wallet;

    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId,
    );

    const [zombie] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("zombie"),
        wallet.publicKey.toBuffer(),
        new anchor.BN(1).toArrayLike(Buffer, "le", 4),
      ],
      program.programId,
    );

    const before = await (program as any).account.zombieAccount.fetch(zombie);

    const tx = await (program as any).methods
      .levelUp()
      .accounts({
        globalState,
        zombie,
        owner: wallet.publicKey,
      })
      .rpc();

    console.log("level up tx", tx);

    const after = await (program as any).account.zombieAccount.fetch(zombie);
    expect(Number(after.level)).to.equal(Number(before.level) + 1);
  });

  it("fails to create a second starter (StarterAlreadyCreated)", async () => {
    const provider = anchor.getProvider();
    const wallet = provider.wallet as anchor.Wallet;

    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId,
    );

    const [playerProfile] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("player-profile"), wallet.publicKey.toBuffer()],
      program.programId,
    );

    const [zombie2] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("zombie"),
        wallet.publicKey.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 4),
      ],
      program.programId,
    );

    // should throw
    let threw = false;
    try {
      await (program as any).methods
        .createStarterZombie("Starter2", new anchor.BN(99999), 1)
        .accounts({
          globalState,
          playerProfile,
          zombie: zombie2,
          owner: wallet.publicKey,
        })
        .rpc();
    } catch (e) {
      threw = true;
    }
    expect(threw).to.be.true;
  });

  it("fails when name is too long (NameTooLong)", async () => {
    const provider = anchor.getProvider();
    const wallet = provider.wallet as anchor.Wallet;

    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId,
    );

    // reuse playerProfile from earlier
    const [playerProfile] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("player-profile"), wallet.publicKey.toBuffer()],
      program.programId,
    );

    const longName = "X".repeat(100);
    const [zombie3] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("zombie"),
        wallet.publicKey.toBuffer(),
        new anchor.BN(3).toArrayLike(Buffer, "le", 4),
      ],
      program.programId,
    );

    let threw2 = false;
    try {
      await (program as any).methods
        .createStarterZombie(longName, new anchor.BN(1), 1)
        .accounts({
          globalState,
          playerProfile,
          zombie: zombie3,
          owner: wallet.publicKey,
        })
        .rpc();
    } catch (e) {
      threw2 = true;
    }
    expect(threw2).to.be.true;
  });

  it("fails to level up when not owner (Unauthorized)", async () => {
    // create a different keypair to act as attacker
    const attacker = anchor.web3.Keypair.generate();
    const provider = anchor.getProvider();
    // fund attacker
    const airdropSig = await provider.connection.requestAirdrop(attacker.publicKey, 1_000_000_000);
    await provider.connection.confirmTransaction(airdropSig);

    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId,
    );

    const [zombie] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("zombie"),
        provider.wallet.publicKey.toBuffer(),
        new anchor.BN(1).toArrayLike(Buffer, "le", 4),
      ],
      program.programId,
    );

    let threw3 = false;
    try {
      await (program as any).methods
        .levelUp()
        .accounts({
          globalState,
          zombie,
          owner: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();
    } catch (e) {
      threw3 = true;
    }
    expect(threw3).to.be.true;
  });

  it("renames a zombie (success)", async () => {
    const provider = anchor.getProvider();
    const wallet = provider.wallet as anchor.Wallet;

    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId,
    );

    const [zombie] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("zombie"),
        wallet.publicKey.toBuffer(),
        new anchor.BN(1).toArrayLike(Buffer, "le", 4),
      ],
      program.programId,
    );

    const newName = "Renamed";
    await (program as any).methods
      .renameZombie(newName)
      .accounts({
        globalState,
        zombie,
        owner: wallet.publicKey,
      })
      .rpc();

    const z = await (program as any).account.zombieAccount.fetch(zombie);
    expect(z.name_len).to.be.gt(0);
    // name() helper isn't available in TS fetch; check stored bytes
    const stored = Buffer.from(z.name as any).slice(0, z.name_len);
    expect(stored.toString()).to.equal(newName);
  });

  it("fails to rename when not owner (Unauthorized)", async () => {
    const attacker = anchor.web3.Keypair.generate();
    const provider = anchor.getProvider();
    await provider.connection.requestAirdrop(attacker.publicKey, 1_000_000_000).then(sig => provider.connection.confirmTransaction(sig));

    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId,
    );

    const [zombie] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("zombie"),
        provider.wallet.publicKey.toBuffer(),
        new anchor.BN(1).toArrayLike(Buffer, "le", 4),
      ],
      program.programId,
    );

    let threw = false;
    try {
      await (program as any).methods
        .renameZombie("x")
        .accounts({
          globalState,
          zombie,
          owner: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();
    } catch (e) {
      threw = true;
    }
    expect(threw).to.be.true;
  });

  it("pauses and unpauses program (admin only)", async () => {
    const provider = anchor.getProvider();
    const wallet = provider.wallet as anchor.Wallet;

    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId,
    );

    // pause as admin
    await (program as any).methods.pause().accounts({ globalState }).rpc();

    // attempt to create a new starter should fail while paused
    const [playerProfile2] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("player-profile"), wallet.publicKey.toBuffer()],
      program.programId,
    );
    const [z2] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("zombie"), wallet.publicKey.toBuffer(), new anchor.BN(10).toArrayLike(Buffer, "le", 4)],
      program.programId,
    );

    let threw = false;
    try {
      await (program as any).methods
        .createStarterZombie("AfterPause", new anchor.BN(5), 1)
        .accounts({ globalState, playerProfile: playerProfile2, zombie: z2, owner: wallet.publicKey })
        .rpc();
    } catch (e) {
      threw = true;
    }
    expect(threw).to.be.true;

    // unpause
    await (program as any).methods.unpause().accounts({ globalState }).rpc();

    // now create should succeed
    const tx = await (program as any).methods
      .createStarterZombie("AfterUnpause", new anchor.BN(6), 1)
      .accounts({ globalState, playerProfile: playerProfile2, zombie: z2, owner: wallet.publicKey })
      .rpc();
    expect(tx).to.exist;
  });
});
