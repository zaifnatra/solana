import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
    const location = useLocation();

    return (
        <nav className="bottom-navbar">
            {/* 1. Discover (Compass) */}
            <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M16.24 7.76L14.12 14.12L7.76 16.24L9.88 9.88L16.24 7.76Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Discover</span>
            </Link>

            {/* 2. Profile / Me (Person) */}
            <Link to="/profile" className={`nav-item ${location.pathname === '/profile' ? 'active' : ''}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Me</span>
            </Link>

            {/* 3. Friends (Two Users) */}
            <Link to="/friends" className={`nav-item ${location.pathname === '/friends' ? 'active' : ''}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Friends</span>
            </Link>

            {/* 4. My Tokens (Coins/Wallet) */}
            <Link to="/my-tokens" className={`nav-item ${location.pathname === '/my-tokens' ? 'active' : ''}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 12V8H6C4.89543 8 4 8.89543 4 10V18C4 19.1046 4.89543 20 6 20H20C21.1046 20 22 19.1046 22 18V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M22 12C22 11.4477 21.5523 11 21 11H18C17.4477 11 17 11.4477 17 12V13C17 13.5523 17.4477 14 18 14H21C21.5523 14 22 13.5523 22 13V12Z" fill="currentColor" />
                </svg>
                <span>Wallet</span>
            </Link>
        </nav>
    );
}
