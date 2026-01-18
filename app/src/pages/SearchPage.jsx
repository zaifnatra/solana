import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import { supabase } from '../supabaseClient';
import BackgroundVideo from '../components/BackgroundVideo'; // Import BackgroundVideo
import ArtistCard from '../components/ArtistCard'; // Import ArtistCard
import './SearchPage.css';

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    // Initial load: show recent artists
    useEffect(() => {
        searchArtists('');
    }, []);

    const searchArtists = async (searchTerm) => {
        setLoading(true);
        setErrorMsg(null);
        try {
            // Hardcoded mocked data for Discover Page
            const mockArtists = [
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
                    mintAddress: 'mock-mint-1'
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
                    mintAddress: 'mock-mint-2'
                },
                {
                    id: 'mock-3',
                    name: 'City Flow',
                    username: '@city_flow',
                    image: '/images/artist_3.png',
                    genre: 'Hip Hop',
                    description: 'Urban stories told through heavy beats.',
                    supporters: 3200,
                    sharePrice: 5.0,
                    walletAddress: 'mock-wallet-3',
                    mintAddress: 'mock-mint-3'
                },
                {
                    id: 'mock-4',
                    name: 'Vibe Queen',
                    username: '@vibe_queen',
                    image: '/images/artist_4.png',
                    genre: 'House',
                    description: 'Electric energy for the digital dancefloor.',
                    supporters: 420,
                    sharePrice: 0.9,
                    walletAddress: 'mock-wallet-4',
                    mintAddress: 'mock-mint-4'
                },
                {
                    id: 'mock-5',
                    name: 'Blue Note',
                    username: '@blue_sax',
                    image: '/images/artist_5.png',
                    genre: 'Jazz',
                    description: 'Smooth jazz fusion in a smoky atmosphere.',
                    supporters: 1500,
                    sharePrice: 3.2,
                    walletAddress: 'mock-wallet-5',
                    mintAddress: 'mock-mint-5'
                }
            ];

            let formatted = mockArtists;

            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                formatted = formatted.filter(a =>
                    a.name.toLowerCase().includes(lower) ||
                    a.username.toLowerCase().includes(lower) ||
                    a.genre.toLowerCase().includes(lower)
                );
            }

            setResults(formatted);
        } catch (err) {
            console.error('Error searching artists:', err);
            setErrorMsg(err.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        const val = e.target.value;
        setQuery(val);
        searchArtists(val);
    };

    return (
        <div className="search-container">
            {/* Background Video Reuse */}
            <BackgroundVideo />

            {/* Reusable Header */}
            <Header title="Discover" />

            {/* Search Bar (Now below header) */}
            <div style={{ padding: '0 20px 20px 20px' }}>
                <div className="search-bar-wrapper">
                    <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M21 21L16.65 16.65" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search for artists..."
                        value={query}
                        onChange={handleSearch}
                        className="search-input"
                    />
                </div>
            </div>

            <div className="search-results" style={{ paddingBottom: '100px' }}>
                {/* Debug info removed */}

                {loading && <p style={{ textAlign: 'center', color: '#888' }}>Searching...</p>}

                {!loading && results.map(artist => (
                    <div key={artist.id} style={{ marginBottom: '15px' }}>
                        <ArtistCard artist={artist} />
                    </div>
                ))}

                {!loading && results.length === 0 && (
                    <div className="no-results">
                        No creators found with tokens.
                    </div>
                )}
            </div>

            <Navbar />
        </div>
    );
}
