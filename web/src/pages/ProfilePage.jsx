import { useState } from 'react';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import BackgroundVideo from '../components/BackgroundVideo'; // Video BG
import { registerArtist } from '../engine';
import { PROFILE } from '../mock';
import { useWallet } from '@solana/wallet-adapter-react';

export default function ProfilePage() {
    const profile = PROFILE;
    const [loading, setLoading] = useState(false);
    const { connected } = useWallet();

    const handleTokenize = async () => {
        if (!connected) return alert("Please connect your wallet first!");
        setLoading(true);
        try {
            const result = await registerArtist();
            alert(`Token Launched Successfully! Mint: ${result.mint}`);
        } catch (error) {
            console.error(error);
            alert(`Error launching token: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container" style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', color: 'white' }}>
            {/* Video Background */}
            <BackgroundVideo />

            <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Header title="My Collection" />

                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '20px',
                    paddingBottom: '100px', // Extra padding for navbar space
                    textAlign: 'center'
                }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '50%',
                        background: '#333', marginBottom: '20px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: '2rem',
                        overflow: 'hidden',
                        flexShrink: 0
                    }}>
                        <img
                            src={profile?.avatar_url || '/images/user_profile.png'}
                            alt="Profile"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
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
        </div>
    );
}
