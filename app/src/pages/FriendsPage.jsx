import React from 'react';
import Navbar from '../components/Navbar';
import Header from '../components/Header';

export default function FriendsPage() {
    return (
        <div className="page-container" style={{ position: 'relative', minHeight: '100vh', paddingBottom: '80px', color: 'white', overflow: 'hidden' }}>
            {/* Background Image */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundImage: "url('/images/friends_bg.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                zIndex: 0 // Foundation
            }} />

            {/* Dark Overlay for Readability */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0,0,0,0.6)',
                zIndex: 0 // Same level, painted after
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
                <Header title="Friends" />

                <div style={{ padding: '20px', textAlign: 'center', marginTop: '100px' }}>
                    <div style={{
                        fontSize: '3rem', marginBottom: '20px', opacity: 0.8,
                        textShadow: '0 4px 10px rgba(0,0,0,0.5)'
                    }}>
                        👥
                    </div>
                    <h2 style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>Social Graph</h2>
                    <p style={{ color: '#eee', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>Connect with creators and friends.</p>
                    <div style={{
                        marginTop: '20px', padding: '10px 20px', background: 'rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: '20px', display: 'inline-block',
                        border: '1px solid rgba(255,255,255,0.2)'
                    }}>
                        Coming Soon
                    </div>
                </div>

                <Navbar />
            </div>
        </div>
    );
}
