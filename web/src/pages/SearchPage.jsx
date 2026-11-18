import { useState } from 'react';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import { ARTISTS } from '../mock';
import BackgroundVideo from '../components/BackgroundVideo'; // Import BackgroundVideo
import ArtistCard from '../components/ArtistCard'; // Import ArtistCard
import './SearchPage.css';

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const lower = query.toLowerCase();
    const results = ARTISTS.filter(a =>
        [a.name, a.username, a.genre].some(field => field.toLowerCase().includes(lower))
    );

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
                        onChange={(e) => setQuery(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            <div className="search-results" style={{ paddingBottom: '100px' }}>
                {results.map(artist => (
                    <div key={artist.id} style={{ marginBottom: '15px' }}>
                        <ArtistCard artist={artist} />
                    </div>
                ))}

                {results.length === 0 && (
                    <div className="no-results">
                        No creators found with tokens.
                    </div>
                )}
            </div>

            <Navbar />
        </div>
    );
}
