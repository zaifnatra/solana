import React from 'react';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import ArtistCard from '../components/ArtistCard';
import { HOLDINGS } from '../mock';
import './MyTokensPage.css';

export default function MyTokensPage() {
    return (
        <div className="page-container" style={{ minHeight: '100vh', paddingBottom: '80px', color: 'white' }}>
            <div className="square-pattern-bg" />
            <div style={{ position: 'relative', zIndex: 1 }}>
                <Header title="My Tokens" />

                <div className="tokens-grid">
                    {HOLDINGS.map(token => (
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
