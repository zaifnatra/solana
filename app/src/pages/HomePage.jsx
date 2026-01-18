import { useState } from 'react';
import Navbar from '../components/Navbar';
import './HomePage.css';

// Mock data for followed artists
const FOLLOWED_ARTISTS = [
    { id: 1, name: 'Nicolas Romero', handle: '@Niccc333', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d' },
    { id: 2, name: 'Kieran Joost', handle: '@kieranjoost', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d' },
    { id: 3, name: 'kt', handle: '@kt', avatar: 'https://i.pravatar.cc/150?u=a04258114e29026302d' },
    { id: 4, name: 'Saymonn', handle: '@saymonn', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d' },
];

export default function HomePage() {
    const [activeTab, setActiveTab] = useState('following');

    return (
        <div className="home-container">
            {/* Hero Header */}
            <div className="hero-header">
                <div style={{ zIndex: 2 }}>
                    <h1>Social Hub</h1>
                    <p className="hero-subtitle">Connect with your favorite artists and collectors.</p>
                </div>
                {/* Overlay for readability if we had a real image */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
                    zIndex: 1
                }}></div>
            </div>

            {/* Tabs */}
            <div className="section-tabs">
                <div
                    className={`tab-item ${activeTab === 'following' ? 'active' : ''}`}
                    onClick={() => setActiveTab('following')}
                >
                    Following <span style={{ background: '#eee', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', verticalAlign: 'middle' }}>{FOLLOWED_ARTISTS.length}</span>
                </div>
                <div
                    className={`tab-item ${activeTab === 'trending' ? 'active' : ''}`}
                    onClick={() => setActiveTab('trending')}
                >
                    Trending
                </div>
            </div>

            {/* Grid */}
            <div className="artists-grid">
                {FOLLOWED_ARTISTS.map(artist => (
                    <div key={artist.id} className="artist-card">
                        <img src={artist.avatar} alt={artist.name} className="artist-avatar" />
                        <h3 className="artist-name">{artist.name}</h3>
                        <p className="artist-handle">{artist.handle}</p>
                        <button className="view-profile-btn">View Profile</button>
                    </div>
                ))}
            </div>

            <Navbar />
        </div>
    );
}
