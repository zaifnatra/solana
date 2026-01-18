import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import { supabase } from '../supabaseClient';
import bgVideo from '../assets/fishglitch.1.mov';
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
            // Fetch artists with their profile data
            let queryBuilder = supabase
                .from('artists')
                .select(`
                    *,
                    profiles (
                        username,
                        first_name,
                        last_name,
                        avatar_url,
                        wallet_address
                    )
                `)
                .limit(20);

            // Note: Supabase ILIKE on joined tables is tricky, usually filter client-side or use complex RPC.
            // For now, simpler to fetch all artists (assuming small volume) and filter client side,
            // OR searching on the 'artists' genre field. 
            // If searchTerm is provided, we might want to search profiles, but we need the Artist row.

            const { data, error } = await queryBuilder;

            if (error) throw error;

            let formatted = data.map(item => ({
                id: item.artist_id,
                name: `${item.profiles?.first_name || ''} ${item.profiles?.last_name || ''}`,
                username: item.profiles?.username,
                image: item.profiles?.avatar_url,
                genre: item.genre,
                description: "Artist",
                supporters: 0,
                sharePrice: 0.001, // Mock price for now or fetch from curve
                walletAddress: item.profiles?.wallet_address || item.profiles?.id, // Need address for trading
                mintAddress: item.mint_address
            }));

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
            <video autoPlay loop muted playsInline className="app-bg-video">
                <source src={bgVideo} type="video/mp4" />
            </video>

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
                {/* DEBUG SECTION */}
                <div style={{ padding: '10px', background: '#220', color: '#ff0', fontSize: '0.8rem', marginBottom: '10px', border: '1px solid #aa0' }}>
                    <p>DEBUG INFO:</p>
                    <p>Loading: {loading ? 'Yes' : 'No'}</p>
                    <p>Results Count: {results ? results.length : 'null'}</p>
                    {errorMsg && <p style={{ color: 'red' }}>Error: {errorMsg}</p>}
                </div>

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
