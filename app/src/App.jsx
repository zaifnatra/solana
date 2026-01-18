import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

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
  }, [])

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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 10 }}>
        <WalletMultiButton />
      </div>

      <h1>Artist Token System</h1>

      {wallet ? (
        <div className="card">
          <h3>Artist Actions</h3>
          <p>For this demo, all actions target YOUR OWN artist profile.</p>

          <div style={{ margin: '10px 0' }}>
            <button onClick={registerArtist}>
              Register as Artist (Init Profile)
            </button>
          </div>

          <hr />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              style={{ padding: '10px', fontSize: '16px', width: '200px' }}
            />

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={buyToken}>Buy Tokens</button>
              <button onClick={sellToken}>Sell Tokens</button>
            </div>
          </div>

          {txSig && (
            <p className="success">
              Success! <br />
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=custom&customUrl=http://127.0.0.1:8899`}
                target="_blank"
                rel="noreferrer"
              >
                View Transaction
              </a>
            </p>
          )}
          {errorMsg && <p style={{ color: 'red', wordBreak: 'break-all' }}>{errorMsg}</p>}
        </div>
      ) : (
        <p>Connect your wallet to get started.</p>
      )}

      {/* Supabase Connection Status */}
      <div style={{ padding: '10px', margin: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h3>Database Connection Status:</h3>
        <p>{session === null ? '🔴 Not Connected / No Session' : '🟢 Connected!'}</p>
      </div>
    </>
  )
}

export default App
