import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolProj } from "../target/types/sol_proj";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";

describe("sol_proj", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolProj as Program<SolProj>;

  // Test accounts
  const artist = Keypair.generate();
  const buyer = Keypair.generate();
  const platformWallet = Keypair.generate();

  // PDA for the artist
  // Note: We need to derive this AFTER generating the artist, but inside the test or describe scope is fine.
  const [artistProfile] = PublicKey.findProgramAddressSync(
    [Buffer.from("artist"), artist.publicKey.toBuffer()],
    program.programId
  );
  const [tokenMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint"), artist.publicKey.toBuffer()],
    program.programId
  );

  it("Registers an Artist", async () => {
    // Airdrop SOL to artist
    await provider.connection.requestAirdrop(artist.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);

    // Wait for confirmation
    await new Promise(r => setTimeout(r, 1000));

    // Register
    const tx = await program.methods.registerArtist()
      .accounts({
        authority: artist.publicKey,
        artistProfile: artistProfile,
        tokenMint: tokenMint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([artist])
      .rpc();

    console.log("Registered Artist:", tx);

    // Verify state
    const profileAccount = await program.account.artistProfile.fetch(artistProfile);
    assert.ok(profileAccount.authority.equals(artist.publicKey));
    assert.ok(profileAccount.tokenSupply.eq(new anchor.BN(0)));
  });

  it("Buys Tokens", async () => {
    // Airdrop SOL to buyer
    await provider.connection.requestAirdrop(buyer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);

    // Wait for airdrop confirmation
    await new Promise(r => setTimeout(r, 1000));

    // Create Associated Token Account for buyer
    const userTokenAccount = getAssociatedTokenAddressSync(tokenMint, buyer.publicKey);

    // ATA creation is now handled by the smart contract via init_if_needed
    // const txCreate = new Transaction().add(...);
    // await provider.sendAndConfirm(txCreate, [buyer]);

    const amount = new anchor.BN(10);

    const tx = await program.methods.buyToken(amount)
      .accounts({
        buyer: buyer.publicKey,
        artistProfile: artistProfile,
        tokenMint: tokenMint,
        userTokenAccount: userTokenAccount,
        platformWallet: platformWallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    console.log("Bought Tokens:", tx);

    // Verify Supply
    const profileAccount = await program.account.artistProfile.fetch(artistProfile);
    assert.ok(profileAccount.tokenSupply.eq(amount));
  });

  it("Sells Tokens", async () => {
    const userTokenAccount = getAssociatedTokenAddressSync(tokenMint, buyer.publicKey);
    const amount = new anchor.BN(5);

    const tx = await program.methods.sellToken(amount)
      .accounts({
        seller: buyer.publicKey,
        artistProfile: artistProfile,
        tokenMint: tokenMint,
        userTokenAccount: userTokenAccount,
        platformWallet: platformWallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    console.log("Sold Tokens:", tx);

    // Verify Supply decreased
    const profileAccount = await program.account.artistProfile.fetch(artistProfile);
    assert.ok(profileAccount.tokenSupply.eq(new anchor.BN(5)));
  });
});
