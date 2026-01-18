import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import './Header.css';

export default function Header({ title }) {
    const [showDropdown, setShowDropdown] = useState(false);

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('Error logging out:', error);
        window.location.reload(); // Force refresh to clear state
    };

    return (
        <header className="app-header">
            <h1 className="header-title">{title || 'Social Hub'}</h1>

            <div className="header-actions">
                <div style={{ marginRight: '10px' }}>
                    <WalletMultiButton />
                </div>
                <div className="profile-menu-container">
                    <button
                        className="profile-icon-btn"
                        onClick={() => setShowDropdown(!showDropdown)}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                            <path d="M12 14C14.2091 14 16 12.2091 16 10C16 7.79086 14.2091 6 12 6C9.79086 6 8 7.79086 8 10C8 12.2091 9.79086 14 12 14Z" stroke="currentColor" strokeWidth="2" />
                            <path d="M6 19.5C6 19.5 7.5 16 12 16C16.5 16 18 19.5 18 19.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </button>

                    {showDropdown && (
                        <div className="profile-dropdown">
                            <div className="dropdown-item" onClick={() => window.location.href = '/settings'}>Settings</div>
                            <div className="dropdown-item">Help</div>
                            <div className="dropdown-divider"></div>
                            <div className="dropdown-item logout" onClick={handleLogout}>Log Out</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Backdrop to close dropdown when clicking outside */}
            {showDropdown && (
                <div className="dropdown-backdrop" onClick={() => setShowDropdown(false)}></div>
            )}
        </header>
    );
}
