import { useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatSol, validQuantity } from '../engine';
import { useTrading } from '../state/TradingContext';
import './ArtistCard.css';

export default function ArtistCard({ artist, showActions = true, balance }) {
  const location = useLocation();
  const returnTo = { from: location.pathname + location.search };
  const [amount, setAmount] = useState('10');
  const [error, setError] = useState('');
  const inputId = useId();
  const { pending, setTradeIntent } = useTrading();
  function trade(side) {
    if (!validQuantity(amount)) {
      setError('Enter 1–10,000 whole tokens.');
      return;
    }
    setError('');
    setTradeIntent({
      symbol: artist.symbol,
      side,
      quantity: Number(amount),
      key: crypto.randomUUID(),
    });
  }
  const url = `/artists/${encodeURIComponent(artist.symbol)}`;
  return (
    <article className="artist-card" aria-label={artist.name}>
      <Link
        to={url}
        state={returnTo}
        className="artist-image-link"
        aria-label={`View ${artist.name}`}
      >
        {artist.image_url ? (
          <img src={artist.image_url} alt="" loading="lazy" />
        ) : (
          <span aria-hidden="true">🎵</span>
        )}
      </Link>
      <div className="artist-card-content">
        <div>
          <div className="artist-card-heading">
            <h3>
              <Link to={url} state={returnTo}>
                {artist.name}
              </Link>
            </h3>
            <span className="artist-genre">{artist.genre}</span>
          </div>
          <p className="artist-description">{artist.description}</p>
        </div>
        {balance !== undefined && (
          <div className="artist-balance">
            <span>Your balance</span>
            <strong>{balance} TOKENS</strong>
          </div>
        )}
        {showActions && (
          <>
            <div className="artist-market-row">
              <span>Price: {formatSol(artist.next_token_lamports)} SOL</span>
              <span>{artist.follower_count || 0} Followers</span>
            </div>
            <div className="trade-actions">
              <div className="custom-input-wrapper">
                <label className="sr-only" htmlFor={inputId}>
                  {artist.name} token quantity
                </label>
                <input
                  id={inputId}
                  className="custom-number-input"
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setError('');
                  }}
                />
                <div className="spin-btn-col">
                  <button
                    className="spin-btn"
                    aria-label={`Increase ${artist.name} quantity`}
                    onClick={() =>
                      setAmount((value) =>
                        String(Math.min(10000, Math.max(0, parseInt(value) || 0) + 1)),
                      )
                    }
                  >
                    ▲
                  </button>
                  <button
                    className="spin-btn"
                    aria-label={`Decrease ${artist.name} quantity`}
                    onClick={() =>
                      setAmount((value) => String(Math.max(1, (parseInt(value) || 1) - 1)))
                    }
                  >
                    ▼
                  </button>
                </div>
              </div>
              <button className="card-buy" onClick={() => trade('buy')} disabled={Boolean(pending)}>
                Buy
              </button>
              <button
                className="card-sell"
                onClick={() => trade('sell')}
                disabled={Boolean(pending)}
              >
                Sell
              </button>
            </div>
            {error && (
              <p className="card-trade-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
