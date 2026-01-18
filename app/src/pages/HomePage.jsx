import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import ArtistCard from '../components/ArtistCard';
import { fetchArtists } from '../utils/mockData';
import './HomePage.css';

export default function HomePage() {
    const [activeTab, setActiveTab] = useState('following');
    const [artists, setArtists] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadArtists = async () => {
            setLoading(true);
            const data = await fetchArtists();
            setArtists(data);
            setLoading(false);
        };
        loadArtists();
    }, []);

    // Simple filter for demo purposes
    const displayArtists = activeTab === 'following'
        ? artists
        : artists.slice().reverse(); // Just reverse for "Trending" simulation

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
                    Following <span style={{ background: '#eee', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', verticalAlign: 'middle' }}>{artists.length}</span>
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
                {loading ? (
                    <p>Loading artists...</p>
                ) : (
                    displayArtists.map(artist => (
                        <ArtistCard key={artist.id} artist={artist} onSelect={() => { }} />
                    ))
                )}
            </div>

            <Navbar />
        </div>
    );
}
