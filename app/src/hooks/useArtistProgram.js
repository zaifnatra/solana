import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getProgram } from "../utils/anchor";
import { useMemo } from "react";

export function useArtistProgram() {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();

    const program = useMemo(() => {
        if (!connection || !wallet) return null;
        return getProgram(connection, wallet);
    }, [connection, wallet]);

    const registerArtist = async (username, genre) => {
        if (!program || !wallet) throw new Error("Wallet not connected");
        console.log("Registering Artist on cluster:", connection.rpcEndpoint);

        try {
            // Check blockhash
            const latestBlockhash = await connection.getLatestBlockhash();
            console.log("Latest blockhash from app connection:", latestBlockhash);
        } catch (e) {
            console.error("Failed to fetch blockhash manually:", e);
        }

        const [artistProfile] = PublicKey.findProgramAddressSync(
            [Buffer.from("artist"), wallet.publicKey.toBuffer()],
            program.programId
        );
        const [tokenMint] = PublicKey.findProgramAddressSync(
            [Buffer.from("mint"), wallet.publicKey.toBuffer()],
            program.programId
        );

        const tx = await program.methods.registerArtist()
            .accounts({
                authority: wallet.publicKey,
                artistProfile: artistProfile,
                tokenMint: tokenMint,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .rpc();

        return { signature: tx, mint: tokenMint.toString() };
    };

    const buyToken = async (artistPubkeyStr, amount) => {
        if (!program || !wallet) throw new Error("Wallet not connected");

        const artistPubkey = new PublicKey(artistPubkeyStr);
        const [artistProfile] = PublicKey.findProgramAddressSync(
            [Buffer.from("artist"), artistPubkey.toBuffer()],
            program.programId
        );
        const [tokenMint] = PublicKey.findProgramAddressSync(
            [Buffer.from("mint"), artistPubkey.toBuffer()],
            program.programId
        );

        const userTokenAccount = getAssociatedTokenAddressSync(
            tokenMint,
            wallet.publicKey
        );

        // Platform fee wallet - hardcoded for hackathon/demo
        // In production this should be a config or ENV
        const platformWallet = new PublicKey("7i4y4j4NwphNWJ92SGEEF1vToojQ9LLWGjccQawi56fm"); // Replace with real one or user's wallet for test

        const amountBN = new anchor.BN(amount);

        const tx = await program.methods.buyToken(amountBN)
            .accounts({
                buyer: wallet.publicKey,
                artistProfile: artistProfile,
                tokenMint: tokenMint,
                userTokenAccount: userTokenAccount,
                platformWallet: platformWallet, // Added this param
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .rpc();

        return tx;
    };

    const sellToken = async (artistPubkeyStr, amount) => {
        if (!program || !wallet) throw new Error("Wallet not connected");

        const artistPubkey = new PublicKey(artistPubkeyStr);
        const [artistProfile] = PublicKey.findProgramAddressSync(
            [Buffer.from("artist"), artistPubkey.toBuffer()],
            program.programId
        );
        const [tokenMint] = PublicKey.findProgramAddressSync(
            [Buffer.from("mint"), artistPubkey.toBuffer()],
            program.programId
        );

        const userTokenAccount = getAssociatedTokenAddressSync(
            tokenMint,
            wallet.publicKey
        );

        // Platform fee wallet
        const platformWallet = new PublicKey("7i4y4j4NwphNWJ92SGEEF1vToojQ9LLWGjccQawi56fm");

        const amountBN = new anchor.BN(amount);

        const tx = await program.methods.sellToken(amountBN)
            .accounts({
                seller: wallet.publicKey,
                artistProfile: artistProfile,
                tokenMint: tokenMint,
                userTokenAccount: userTokenAccount,
                platformWallet: platformWallet,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        return tx;
    };

    return {
        program,
        registerArtist,
        buyToken,
        sellToken
    };
}
