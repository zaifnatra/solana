import React from 'react';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import bgVideo from '../assets/fishglitch.1.mov'; // Reuse background

export default function FriendsPage() {
    return (
        <div className="page-container" style={{ color: 'white', minHeight: '100vh', paddingBottom: '80px' }}>
            {/* Background Video */}
            <video autoPlay loop muted playsInline className="app-bg-video">
                <source src={bgVideo} type="video/mp4" />
            </video>

            <Header title="Friends" />

            <div style={{ padding: '20px', textAlign: 'center', marginTop: '100px' }}>
                <div style={{
                    fontSize: '3rem', marginBottom: '20px', opacity: 0.5
                }}>
                    👥
                </div>
                <h2>Social Graph</h2>
                <p style={{ color: '#aaa' }}>Connect with creators and friends.</p>
                <div style={{
                    marginTop: '20px', padding: '10px 20px', background: 'rgba(255,255,255,0.1)',
                    borderRadius: '20px', display: 'inline-block'
                }}>
                    Coming Soon
                </div>
            </div>

            <Navbar />
        </div>
    );
}
