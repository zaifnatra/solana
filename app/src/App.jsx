import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './App.css'
import SignInPage from './pages/SignInPage'
// import HomePage from './pages/HomePage' // Replaced by SearchPage for now
import SearchPage from './pages/SearchPage'
import RegisterPage from './pages/RegisterPage'
import OnboardingPage from './pages/OnboardingPage'
import MintNFTPage from './pages/MintNFTPage'
import ProfilePage from './pages/ProfilePage'
import FriendsPage from './pages/FriendsPage'
import MyTokensPage from './pages/MyTokensPage'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getProgram } from "./utils/anchor";
import { PublicKey } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

function App() {
  const [session, setSession] = useState(null)
  const [isOnboarded, setIsOnboarded] = useState(null) // null = loading

  console.log("App Render: Session exists?", !!session, " | Onboarded state:", isOnboarded);

  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  // Check Supabase connection & Profile
  useEffect(() => {
    // 1. Initial Session Check
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Supabase connection error:', error)
      } else {
        setSession(data.session)
      }
    })

    // 2. Auth Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 3. React to Session Changes (The Robust Way)
  useEffect(() => {
    if (session) {
      console.log("Session active, checking profile for:", session.user.id);
      checkProfile(session.user.id);
    } else {
      // If no session, we don't need to know if onboarded, but reset it just in case
      setIsOnboarded(null);
    }
  }, [session]);

  const checkProfile = async (userId) => {
    // Safety timeout: If DB hangs, let them through to onboarding after 3s
    const timer = setTimeout(() => {
      console.warn("Profile check timed out, defaulting to false");
      setIsOnboarded((prev) => (prev === null ? false : prev));
    }, 5000);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', userId)
        .single()

      clearTimeout(timer);

      if (error) {
        console.log("Profile not found or error (normal for new users):", error.message);
        setIsOnboarded(false);
        return;
      }

      if (data && data.onboarding_completed) {
        console.log("User is onboarded.");
        setIsOnboarded(true)
      } else {
        console.log("User is NOT onboarded.");
        setIsOnboarded(false)
      }
    } catch (err) {
      clearTimeout(timer);
      console.error('Error fetching profile:', err)
      setIsOnboarded(false)
    }
  }

  // 4. Sync Wallet with Supabase Profile
  useEffect(() => {
    const syncWallet = async () => {
      if (wallet && session?.user?.id) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('wallet_address')
            .eq('id', session.user.id)
            .single();

          if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
            console.error("Error fetching profile for sync:", error);
            return;
          }

          const currentWalletAddr = wallet.publicKey.toString();

          // If profile exists but has no wallet, or different wallet, update it
          if (profile && profile.wallet_address !== currentWalletAddr) {
            console.log("Syncing wallet to profile:", currentWalletAddr);
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ wallet_address: currentWalletAddr })
              .eq('id', session.user.id);

            if (updateError) console.error("Failed to sync wallet:", updateError);
            else console.log("Wallet synced successfully.");
          }
        } catch (err) {
          console.error("Wallet sync failed:", err);
        }
      }
    };

    syncWallet();
  }, [wallet, session]);

  // Render the Login page if not authenticated
  if (!session) {
    return <SignInPage onLoginSuccess={setSession} />
  }

  // Show loading state while checking profile (optional, or just default to allowing render)
  if (isOnboarded === null) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>
  }

  // Render the App with Routing once authenticated
  return (
    <BrowserRouter>
      <div className="app-layout">


        <Routes>
          <Route
            path="/onboarding"
            element={
              isOnboarded ? <Navigate to="/" /> : <OnboardingPage session={session} onComplete={() => setIsOnboarded(true)} />
            }
          />

          {/* Protected Routes: Redirect to /onboarding if not completed */}
          {/* Main Feed is now "Discover" (SearchPage) */}
          <Route path="/" element={isOnboarded ? <SearchPage /> : <Navigate to="/onboarding" />} />

          <Route path="/profile" element={isOnboarded ? <ProfilePage /> : <Navigate to="/onboarding" />} />
          <Route path="/friends" element={isOnboarded ? <FriendsPage /> : <Navigate to="/onboarding" />} />


          <Route path="/register" element={isOnboarded ? <RegisterPage /> : <Navigate to="/onboarding" />} />
          <Route path="/mint-nft" element={isOnboarded ? <MintNFTPage /> : <Navigate to="/onboarding" />} />
          <Route path="/my-tokens" element={isOnboarded ? <MyTokensPage /> : <Navigate to="/onboarding" />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
