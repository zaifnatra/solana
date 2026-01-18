import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import SignInPage from './pages/SignInPage'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import RegisterPage from './pages/RegisterPage'
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

  // Render the Login page if not authenticated
  if (!session) {
    return <SignInPage onLoginSuccess={setSession} />
  }

  // Render the App with Routing once authenticated
  return (
    <BrowserRouter>
      <div className="app-layout">
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 100 }}>
          <WalletMultiButton />
        </div>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
