import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { formatSol, getArtist, safeExternalUrl, setFollowing } from '../engine';
import { useTrading } from '../state/TradingContext';
import ArtistCard from '../components/ArtistCard';
import BackgroundVideo from '../components/BackgroundVideo';
import Header from '../components/Header';
import Navbar from '../components/Navbar';
import AccountStart from '../components/AccountStart';
import ServiceNotice from '../components/ServiceNotice';
import './ArtistPage.css';

export default function ArtistPage() {
  const { symbol } = useParams();
  const location = useLocation();
  const { token, reload, version } = useTrading();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showStart, setShowStart] = useState(false);
  useEffect(() => {
    let active = true;
    getArtist(symbol, token)
      .then((result) => {
        if (active) {
          setData(result);
          setError('');
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [symbol, token, version]);
  const artist = data?.artist?.symbol === symbol ? data.artist : null;
  async function follow() {
    if (!token) {
      setShowStart(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setFollowing(token, symbol, !artist.following);
      reload();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const website = safeExternalUrl(artist?.website_url);
  const music = safeExternalUrl(artist?.music_url);
  return (
    <div className="service-page">
      <BackgroundVideo />
      <div className="service-content">
        <Header title={artist?.name || 'Artist'} />
        <ServiceNotice />
        <main className="service-column">
          <Link to={location.state?.from || '/'} className="artist-back">
            ← Back to artists
          </Link>
          {error && (
            <p role="alert" className="service-error service-panel">
              {error}
            </p>
          )}
          {!artist && !error && (
            <p role="status" className="service-muted">
              Loading artist…
            </p>
          )}
          {artist && (
            <>
              <ArtistCard artist={artist} />
              <section className="service-panel">
                <div className="artist-about-heading">
                  <h2>Behind the music</h2>
                  <button onClick={follow} disabled={busy} aria-pressed={Boolean(artist.following)}>
                    {busy ? 'Saving…' : artist.following ? 'Following' : 'Follow artist'}
                  </button>
                </div>
                <p className="artist-bio">{artist.bio || artist.description}</p>
                {artist.is_demo && (
                  <p className="service-muted">
                    Demo artist profile. This paper market is not an endorsement or an investment in
                    this artist.
                  </p>
                )}
                <p className="service-muted">
                  {artist.follower_count} {artist.follower_count === 1 ? 'follower' : 'followers'} ·{' '}
                  {artist.genre}
                </p>
                <div className="artist-links">
                  {website && (
                    <a href={website} target="_blank" rel="noreferrer">
                      Artist website ↗
                    </a>
                  )}
                  {music && (
                    <a href={music} target="_blank" rel="noreferrer">
                      Listen to their music ↗
                    </a>
                  )}
                </div>
              </section>
              {showStart && !token && <AccountStart />}
              <section className="service-panel">
                <h2>The paper market</h2>
                <dl className="quote-list">
                  <div>
                    <dt>Token symbol</dt>
                    <dd>{artist.symbol}</dd>
                  </div>
                  <div>
                    <dt>Circulating supply</dt>
                    <dd>{artist.supply} tokens</dd>
                  </div>
                  <div>
                    <dt>Paper reserve</dt>
                    <dd>{formatSol(artist.reserve_lamports)} SOL</dd>
                  </div>
                  <div>
                    <dt>Next token, before fees</dt>
                    <dd>{formatSol(artist.next_token_lamports)} SOL</dd>
                  </div>
                </dl>
                <p className="service-muted">
                  The price follows supply. A 5% fee applies to buys and sells. Review the exact
                  total in the confirmation sheet before every trade.
                </p>
              </section>
              <section className="service-panel">
                <h2>Releases & updates</h2>
                {data.releases.length ? (
                  data.releases.map((release) => (
                    <article className="release-item" key={release.id}>
                      <h3>{release.title}</h3>
                      <time dateTime={new Date(release.created_at * 1000).toISOString()}>
                        {new Date(release.created_at * 1000).toLocaleDateString()}
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
                    No releases published yet. Follow this artist to see future updates in Friends.
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
