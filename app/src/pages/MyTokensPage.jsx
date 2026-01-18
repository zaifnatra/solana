import React from 'react';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import ArtistCard from '../components/ArtistCard';
import './MyTokensPage.css';

export default function MyTokensPage() {
    // Hardcoded holdings as requested, based on Discover page artists
    const myTokens = [
        {
            id: 'mock-1',
            name: 'Neo Beat',
            username: '@neo_beat',
            image: '/images/artist_1.png',
            genre: 'Electronic',
            description: 'Futuristic synthwaves and neon rhythms.',
            supporters: 1240,
            sharePrice: 2.5,
            walletAddress: 'mock-wallet-1',
            mintAddress: 'mock-mint-1',
            balance: 50 // Hardcoded amount
        },
        {
            id: 'mock-2',
            name: 'Velvet Soul',
            username: '@velvet_soul',
            image: '/images/artist_2.png',
            genre: 'R&B',
            description: 'Soulful melodies with a modern twist.',
            supporters: 850,
            sharePrice: 1.8,
            walletAddress: 'mock-wallet-2',
            mintAddress: 'mock-mint-2',
            balance: 120 // Hardcoded amount
        }
    ];

    return (
        <div className="page-container" style={{ minHeight: '100vh', paddingBottom: '80px', color: 'white' }}>
            <div className="square-pattern-bg" />
            <div style={{ position: 'relative', zIndex: 1 }}>
                <Header title="My Tokens" />

                <div className="tokens-grid">
                    {myTokens.map(token => (
                        <div key={token.id} style={{ marginBottom: '20px' }}>
                            {/* Reuse Artist Card for the visual */}
                            <ArtistCard artist={token} showActions={false} balance={token.balance} />
                        </div>
                    ))}
                </div>

                <Navbar />
            </div>
        </div>
    );
}
