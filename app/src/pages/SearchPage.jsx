import { useState } from 'react';
import Navbar from '../components/Navbar';
import './SearchPage.css';

// Mock data to search through
const SEARCH_DATA = [
    { id: 1, name: 'Nicolas Romero', handle: '@Niccc333', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d' },
    { id: 2, name: 'Kieran Joost', handle: '@kieranjoost', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d' },
    { id: 3, name: 'kt', handle: '@kt', avatar: 'https://i.pravatar.cc/150?u=a04258114e29026302d' },
    { id: 4, name: 'Saymonn', handle: '@saymonn', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d' },
    { id: 5, name: 'Alice Wonderland', handle: '@alice', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024e' },
    { id: 6, name: 'Bob Builder', handle: '@bobbuilds', avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024f' },
];

export default function SearchPage() {
    const [query, setQuery] = useState('');

    const results = SEARCH_DATA.filter(artist =>
        artist.name.toLowerCase().includes(query.toLowerCase()) ||
        artist.handle.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <div className="search-container">
            <div className="search-header">
                <h1>Find Artists</h1>
                <div className="search-bar-wrapper">
                    <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M21 21L16.65 16.65" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search for artists..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="search-input"
                        autoFocus
                    />
                </div>
            </div>

            <div className="search-results">
                {results.map(artist => (
                    <div key={artist.id} className="search-result-item">
                        <img src={artist.avatar} alt={artist.name} className="result-avatar" />
                        <div className="result-info">
                            <div className="result-name">{artist.name}</div>
                            <div className="result-handle">{artist.handle}</div>
                        </div>
                        <button className="follow-btn">Follow</button>
                    </div>
                ))}
                {results.length === 0 && (
                    <div className="no-results">
                        No artists found.
                    </div>
                )}
            </div>

            <Navbar />
        </div>
    );
}
