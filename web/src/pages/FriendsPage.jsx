import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import AccountStart from '../components/AccountStart';
import ServiceNotice from '../components/ServiceNotice';
import { useTrading } from '../state/TradingContext';
import { getFeed, safeExternalUrl, setFollowing } from '../engine';
import './FriendsPage.css';

export default function FriendsPage() {
  const { token, version, reload } = useTrading();
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!token) return;
    let active = true;
    getFeed(token)
      .then((result) => {
        if (active) {
          setFeed(result);
          setError('');
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [token, version]);
  async function unfollow(symbol) {
    setBusy(symbol);
    setError('');
    try {
      await setFollowing(token, symbol, false);
      reload();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="service-page">
      <div className="friends-background" />
      <div className="service-content">
        <Header title="Friends" />
        <ServiceNotice />
        <main className="service-column">
          {!token ? (
            <AccountStart />
          ) : (
            <>
              <section className="service-panel">
                <h2>Your circle</h2>
                <p className="service-muted">
                  The artists you follow, and the releases they share.
                </p>
                {error && (
                  <p role="alert" className="service-error">
                    {error}
                  </p>
                )}
                {!feed && !error && <p role="status">Loading your circle…</p>}
                {feed?.following.length
                  ? feed.following.map((artist) => (
                      <div className="following-row" key={artist.symbol}>
                        <Link
                          className="following-identity"
                          to={`/artists/${encodeURIComponent(artist.symbol)}`}
                        >
                          <img
                            src={artist.image_url || '/images/user_profile.webp'}
                            alt=""
                            loading="lazy"
                          />
                          <span>
                            <strong>{artist.name}</strong>
                            <small>{artist.genre}</small>
                          </span>
                        </Link>
                        <button
                          onClick={() => unfollow(artist.symbol)}
                          disabled={busy === artist.symbol}
                          aria-label={`Unfollow ${artist.name}`}
                        >
                          {busy === artist.symbol ? 'Saving…' : 'Following'}
                        </button>
                      </div>
                    ))
                  : feed && (
                      <div className="empty-state">
                        <p>Follow an artist from Discover to start your circle.</p>
                        <Link to="/">Find artists →</Link>
                      </div>
                    )}
              </section>
              <section className="service-panel">
                <h2>From your artists</h2>
                {feed?.releases.length ? (
                  feed.releases.map((release) => (
                    <article className="release-item" key={release.id}>
                      <Link to={`/artists/${encodeURIComponent(release.symbol)}`}>
                        {release.artist_name}
                      </Link>
                      <h3>{release.title}</h3>
                      <time dateTime={new Date(release.created_at * 1000).toISOString()}>
                        {new Date(release.created_at * 1000).toLocaleString()}
                      </time>
                      <p>{release.description}</p>
                      {safeExternalUrl(release.preview_url) && (
                        <audio
                          controls
                          preload="none"
                          src={safeExternalUrl(release.preview_url)}
                          aria-label={`Preview ${release.title}`}
                        />
                      )}
                    </article>
                  ))
                ) : (
                  <p className="service-muted">
                    New releases from your followed artists will appear here.
                  </p>
                )}
              </section>
            </>
          )}
        </main>
        <Navbar />
      </div>
    </div>
  );
}
