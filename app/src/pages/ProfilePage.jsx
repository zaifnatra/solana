import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import bgVideo from '../assets/fishglitch.1.mov'; // Reuse background
import { supabase } from '../supabaseClient';
import { useArtistProgram } from '../hooks/useArtistProgram';
import { useWallet } from '@solana/wallet-adapter-react';

export default function ProfilePage() {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    const { registerArtist } = useArtistProgram();
    const { connected } = useWallet();

    useEffect(() => {
        getProfile();
    }, []);

    const getProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUser(user);
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            // FALLBACK: If no profile found (or database error), use Mock Data for testing
            if (!data) {
                console.warn("No profile found from DB, using MOCK ARTIST profile.");
                setProfile({
                    first_name: "Test",
                    last_name: "Creator",
                    username: "test_creator",
                    role: 'artist', // HARDCODED ROLE
                    avatar_url: null,
                    genres: ['Electronic']
                });
            } else {
                setProfile(data);
            }
        }
    };

    const handleTokenize = async () => {
        if (!connected) return alert("Please connect your wallet first!");
        if (!profile) return;

        setLoading(true);
        try {
            // Using username as the unique identifier for seed if strict, or wallet.
            // Hook uses wallet public key, which is good.
            const result = await registerArtist(profile.username || "Artist", profile.genres?.[0] || "General");
            console.log("Tokenized!", result);

            // SAVE TO SUPABASE
            // 1. Ensure Profile Exists (Fix for "Account already in use" / missing profile)
            if (profile.role === 'artist') { // If we are here, we are an artist
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: user.id,
                        username: profile.username || 'unknown',
                        first_name: profile.first_name || 'Unknown',
                        last_name: profile.last_name || 'Artist',
                        role: 'artist',
                        onboarding_completed: true
                    });
                if (profileError) console.warn("Profile upsert warning:", profileError);
            }

            // 2. Save Artist Entry
            const { error: dbError } = await supabase
                .from('artists')
                .upsert({
                    artist_id: user.id, // The profile UUID
                    mint_address: result.mint,
                    genre: profile.genres?.[0] || 'General',
                    total_backed: 0
                });

            if (dbError) {
                console.error("Failed to save artist to DB:", dbError);
                alert(`Token launched but DB save failed: ${dbError.message}`);
            } else {
                alert(`Token Launched Successfully! Mint: ${result.mint}`);
                // Simple verify
                console.log("Saved artist linked to user:", user.id);
            }
        } catch (error) {
            console.error(error);
            alert(`Error launching token: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container" style={{ color: 'white', minHeight: '100vh', paddingBottom: '80px' }}>
            {/* Background Video */}
            <video autoPlay loop muted playsInline className="app-bg-video">
                <source src={bgVideo} type="video/mp4" />
            </video>

            <Header title="My Collection" />

            <div style={{ padding: '20px', textAlign: 'center', marginTop: '100px' }}>
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: '#333', margin: '0 auto 20px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '2rem',
                    overflow: 'hidden'
                }}>
                    {profile?.avatar_url ? <img src={profile.avatar_url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                </div>
                <h2>{profile?.first_name ? `${profile.first_name} ${profile.last_name}` : 'Your Profile'}</h2>
                <p style={{ color: '#aaa' }}>@{profile?.username}</p>

                {profile?.role === 'artist' && (
                    <div style={{ marginTop: '20px' }}>
                        <button
                            onClick={handleTokenize}
                            disabled={loading}
                            style={{
                                padding: '10px 20px',
                                background: 'linear-gradient(45deg, #FFD700, #FFA500)',
                                border: 'none',
                                borderRadius: '25px',
                                color: 'black',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(255, 215, 0, 0.3)'
                            }}
                        >
                            {loading ? 'Launching...' : '🚀 Launch Artist Token'}
                        </button>
                    </div>
                )}

                <p style={{ color: '#aaa', marginTop: '20px' }}>NFTs and Badges coming soon.</p>
            </div>

            <Navbar />
        </div>
    );
}
