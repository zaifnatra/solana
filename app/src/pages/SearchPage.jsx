import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import bgVideo from '../assets/fishglitch.1.mov';
import './SearchPage.css';

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // Initial load: show recent users?
    useEffect(() => {
        searchProfiles('');
    }, []);

    const searchProfiles = async (searchTerm) => {
        setLoading(true);
        try {
            let queryBuilder = supabase
                .from('profiles')
                .select('id, username, first_name, last_name, avatar_url')
                .limit(20);

            if (searchTerm) {
                queryBuilder = queryBuilder.ilike('username', `%${searchTerm}%`);
            } else {
                // If no search, maybe show latest users?
                queryBuilder = queryBuilder.order('updated_at', { ascending: false });
            }

            const { data, error } = await queryBuilder;

            if (error) throw error;
            setResults(data || []);
        } catch (err) {
            console.error('Error searching profiles:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        const val = e.target.value;
        setQuery(val);
        // Debounce could be added here, but for now direct call is fine for small DB
        searchProfiles(val);
    };

    return (
        <div className="search-container">
            {/* Background Video Reuse */}
            <video autoPlay loop muted playsInline className="app-bg-video">
                <source src={bgVideo} type="video/mp4" />
            </video>

            <div className="search-header">
                <h1>Discover</h1>
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

            <div className="search-results">
                {loading && <p style={{ textAlign: 'center', color: '#888' }}>Searching...</p>}

                {!loading && results.map(user => (
                    <div key={user.id} className="search-result-item">
                        {user.avatar_url ? (
                            <img src={user.avatar_url} alt={user.username} className="result-avatar" />
                        ) : (
                            <div className="result-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#333', fontSize: '1.2rem' }}>
                                {user.username ? user.username.charAt(0).toUpperCase() : '?'}
                            </div>
                        )}
                        <div className="result-info">
                            <div className="result-name">{user.first_name} {user.last_name}</div>
                            <div className="result-handle">@{user.username}</div>
                        </div>
                        <button className="follow-btn">View</button>
                    </div>
                ))}

                {!loading && results.length === 0 && (
                    <div className="no-results">
                        No artists found.
                    </div>
                )}
            </div>

            <Navbar />
        </div>
    );
}
