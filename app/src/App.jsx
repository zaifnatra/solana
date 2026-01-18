import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import SignInPage from './pages/SignInPage'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getProgram } from "./utils/anchor";
import { PublicKey } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

function App() {
  const [session, setSession] = useState(null)
  const [txSig, setTxSig] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [amount, setAmount] = useState('10'); // Default buy amount

  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  // Check Supabase connection
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Supabase connection error:', error)
      } else {
        console.log('Supabase Connected! Session:', data.session)
        setSession(data.session)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!session) {
    return <SignInPage onLoginSuccess={setSession} />
  }

  const registerArtist = async () => {
    if (!wallet) return;
    setErrorMsg(''); setTxSig('');
    try {
      const program = getProgram(connection, wallet);
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

      console.log("Registered Artist:", tx);
      setTxSig(tx);
    } catch (error) {
      console.error("Error registering:", error);
      setErrorMsg(error.toString());
    }
  };

  const buyToken = async () => {
    if (!wallet) return;
    setErrorMsg(''); setTxSig('');
    try {
      const program = getProgram(connection, wallet);

      const artistPubkey = wallet.publicKey;

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

      const amountBN = new anchor.BN(amount);

      // Note: Anchor automatically derives the associatedTokenProgram if needed, but passing explicit accounts is safer
      const tx = await program.methods.buyToken(amountBN)
        .accounts({
          buyer: wallet.publicKey,
          artistProfile: artistProfile,
          tokenMint: tokenMint,
          userTokenAccount: userTokenAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("Bought Tokens:", tx);
      setTxSig(tx);
    } catch (error) {
      console.error("Error buying:", error);
      setErrorMsg(error.toString());
    }
  }

  const sellToken = async () => {
    if (!wallet) return;
    setErrorMsg(''); setTxSig('');
    try {
      const program = getProgram(connection, wallet);
      const artistPubkey = wallet.publicKey;

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

      const amountBN = new anchor.BN(amount);

      const tx = await program.methods.sellToken(amountBN)
        .accounts({
          seller: wallet.publicKey,
          artistProfile: artistProfile,
          tokenMint: tokenMint,
          userTokenAccount: userTokenAccount,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("Sold Tokens:", tx);
      setTxSig(tx);
    } catch (error) {
      console.error("Error selling:", error);
      setErrorMsg(error.toString());
    }
  }

  // Render the Login page if not authenticated
  if (!session) {
    return <SignInPage onLoginSuccess={setSession} />
  }

  // Render the App with Routing once authenticated
  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* Wallet connection can stay global or move to pages */}
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100 }}>
          <WalletMultiButton />
        </div>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>

        {/* Supabase Status Debug (Optional, can hide) */}
        {/* <div style={{ position: 'fixed', bottom: 70, right: 10, opacity: 0.5, fontSize: '10px', background: 'white', padding: 5 }}>
             {session ? '🟢 DB Connected' : '🔴 Disconnected'}
          </div> */}
      </div>
    </BrowserRouter>
  )
}

export default App
