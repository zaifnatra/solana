import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import BackgroundVideo from '../components/BackgroundVideo';
import ArtistCard from '../components/ArtistCard';
import ServiceNotice from '../components/ServiceNotice';
import { useTrading } from '../state/TradingContext';
import './SearchPage.css';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const lower = query.trim().toLowerCase();
  const { artists, loading } = useTrading();
  const results = artists.filter((artist) =>
    [artist.name, artist.username || '', artist.genre, artist.symbol].some((field) =>
      field.toLowerCase().includes(lower),
    ),
  );
  return (
    <div className="search-container">
      <BackgroundVideo />
      <Header title="Discover" />
      <ServiceNotice />
      <div className="search-bar-region">
        <div className="search-bar-wrapper">
          <svg
            className="search-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" stroke="#888" strokeWidth="2" />
            <path d="M21 21L16.65 16.65" stroke="#888" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label="Search for artists"
            placeholder="Search for artists..."
            value={query}
            onChange={(event) =>
              setParams(event.target.value ? { q: event.target.value } : {}, { replace: true })
            }
            className="search-input"
          />
        </div>
      </div>
      <main className="search-results">
        {loading && !artists.length ? (
          <p className="service-muted" role="status">
            Loading artists…
          </p>
        ) : (
          results.map((artist) => <ArtistCard key={artist.symbol} artist={artist} />)
        )}
        {!loading && !results.length && (
          <div className="empty-state service-panel">
            <h2>No artists found</h2>
            <p>Try another name, genre, or token symbol.</p>
          </div>
        )}
      </main>
      <Navbar />
    </div>
  );
}
