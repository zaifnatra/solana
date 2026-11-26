import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import GlassDialog from './GlassDialog';
import './Header.css';

export default function Header({ title }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [help, setHelp] = useState(false);
  const button = useRef(null);
  useEffect(() => {
    if (!showDropdown) return;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setShowDropdown(false);
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showDropdown]);
  return (
    <>
      <header className="app-header">
        <div>
          <h1 className="header-title">{title || 'Social Hub'}</h1>
          <span className="paper-indicator">PAPER MODE · PRACTICE FUNDS</span>
        </div>
        <div className="header-actions">
          <WalletMultiButton />
          <div className="profile-menu-container">
            <button
              ref={button}
              className="profile-icon-btn"
              aria-label="Open profile menu"
              aria-expanded={showDropdown}
              aria-controls="profile-dropdown"
              onClick={() => setShowDropdown((value) => !value)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="10" r="4" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M6 19.5S7.5 16 12 16s6 3.5 6 3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {showDropdown && (
              <div className="profile-dropdown" id="profile-dropdown">
                <Link
                  to="/profile"
                  className="dropdown-item"
                  onClick={() => setShowDropdown(false)}
                >
                  Profile
                </Link>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowDropdown(false);
                    setHelp(true);
                  }}
                >
                  Help
                </button>
              </div>
            )}
          </div>
        </div>
        {showDropdown && (
          <div className="dropdown-backdrop" onClick={() => setShowDropdown(false)} />
        )}
      </header>
      {help && (
        <GlassDialog title="How MTL works" onClose={() => setHelp(false)}>
          <p>Discover artists, follow their releases, and build a paper collection.</p>
          <p className="service-muted">
            Paper accounts start with 100 practice SOL. Prices follow a bonding curve: buying
            increases supply and price; selling reverses it. Every quote includes the 5% fee and an
            exact price limit.
          </p>
          <p className="service-muted">
            All trades here use simulated funds. The wallet picker connects your Solana wallet for
            future on-chain features; it does not fund this paper account or send transactions.
          </p>
          <p className="service-muted">
            Your paper account access is stored in this browser. Clearing site data loses access. An
            interrupted trade can be checked again without submitting a duplicate.
          </p>
          <button className="service-button" onClick={() => setHelp(false)}>
            Got it
          </button>
        </GlassDialog>
      )}
    </>
  );
}
