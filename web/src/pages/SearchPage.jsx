import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import BackgroundVideo from '../components/BackgroundVideo';
import ArtistCard from '../components/ArtistCard';
import ServiceNotice from '../components/ServiceNotice';
import { useTrading } from '../state/TradingContext';
import './SearchPage.css';

const sortOptions = [
  ['default', 'Default order'],
  ['name', 'Artist name A–Z'],
  ['price-low', 'Price: low to high'],
  ['price-high', 'Price: high to low'],
  ['followers', 'Most followed'],
];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const lower = query.trim().toLowerCase();
  const genre = params.get('genre') || '';
  const sort = sortOptions.some(([value]) => value === params.get('sort'))
    ? params.get('sort')
    : 'default';
  const { artists, loading, error } = useTrading();
  const genres = [...new Set(artists.map((artist) => artist.genre).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const results = artists.filter(
    (artist) =>
      (!genre || artist.genre === genre) &&
      [artist.name, artist.username || '', artist.genre, artist.symbol].some((field) =>
        (field || '').toLowerCase().includes(lower),
      ),
  );
  if (sort !== 'default') {
    results.sort((a, b) => {
      const nameOrder = a.name.localeCompare(b.name) || a.symbol.localeCompare(b.symbol);
      if (sort === 'price-low') return a.next_token_lamports - b.next_token_lamports || nameOrder;
      if (sort === 'price-high') return b.next_token_lamports - a.next_token_lamports || nameOrder;
      if (sort === 'followers')
        return (b.follower_count || 0) - (a.follower_count || 0) || nameOrder;
      return nameOrder;
    });
  }
  const hasFilters = Boolean(query || genre || sort !== 'default');
  const initialLoading = loading && !artists.length;
  function updateParam(key, value, replace = false) {
    // Router renders can lag consecutive input events. Read the committed URL
    // so a fast filter change cannot restore a previous search value.
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace });
  }
  function resetFilters() {
    // Router renders can lag consecutive input events. Read the committed URL
    // so a fast filter change cannot restore a previous search value.
    const next = new URLSearchParams(window.location.search);
    ['q', 'genre', 'sort'].forEach((key) => next.delete(key));
    setParams(next);
  }
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
            onChange={(event) => updateParam('q', event.target.value, true)}
            className="search-input"
          />
        </div>
        <div className="discover-filters" aria-label="Filter and sort artists">
          <label>
            <span>Genre</span>
            <select value={genre} onChange={(event) => updateParam('genre', event.target.value)}>
              <option value="">All genres</option>
              {genre && !genres.includes(genre) && <option value={genre}>{genre}</option>}
              {genres.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(event) =>
                updateParam('sort', event.target.value === 'default' ? '' : event.target.value)
              }
            >
              {sortOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="discover-results-summary">
          <span role="status" aria-live="polite" aria-atomic="true">
            {initialLoading
              ? 'Finding artists…'
              : error && !artists.length
                ? 'Artists unavailable'
                : `${results.length} ${results.length === 1 ? 'artist' : 'artists'}${genre ? ` · ${genre}` : ''}`}
          </span>
          {hasFilters && <button onClick={resetFilters}>Reset filters</button>}
        </div>
      </div>
      <main className="search-results" aria-label="Artists" aria-busy={initialLoading}>
        {initialLoading ? (
          <div className="discover-loading" aria-hidden="true">
            {[0, 1].map((item) => (
              <div className="discover-placeholder" key={item}>
                <div className="discover-placeholder-image" />
                <div className="discover-placeholder-content">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>
        ) : (
          results.map((artist) => <ArtistCard key={artist.symbol} artist={artist} />)
        )}
        {!loading && !results.length && !(error && !artists.length) && (
          <div className="empty-state service-panel">
            <span className="discover-empty-icon" aria-hidden="true">
              ♫
            </span>
            <h2>{artists.length ? 'No artists found' : 'No artists yet'}</h2>
            <p>
              {artists.length
                ? 'Try another name, genre, or token symbol.'
                : 'Artist tokens will appear here when they launch.'}
            </p>
            {hasFilters && <button onClick={resetFilters}>Show all artists</button>}
          </div>
        )}
      </main>
      <Navbar />
    </div>
  );
}
