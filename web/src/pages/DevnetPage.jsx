import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import Header from '../components/Header';
import Navbar from '../components/Navbar';
import BackgroundVideo from '../components/BackgroundVideo';
import DevnetTradeDialog from '../components/DevnetTradeDialog';
import { DEVNET_MANIFEST_URL } from '../devnet/config';
import {
  loadManifest,
  verifyNetwork,
  readMarket,
  curveQuote,
  sol,
  readPending,
  pendingKey,
  clearPending,
  reconcile,
  explorer,
  tokenAddress,
  decodeHolding,
} from '../devnet/client';
import './DevnetPage.css';

const statusText = {
  pending: 'Submitted. Waiting for a chain result.',
  confirming: 'Observed on-chain. Waiting for finalization.',
  'failure-pending': 'The chain reported an error. Waiting for its final result.',
  finalized: 'Trade finalized on devnet.',
  failed: 'Transaction failed. No trade settled; a network fee may have been charged.',
  'expired-unresolved':
    'The signing window expired, but this RPC cannot establish the outcome. Keep this signature and investigate on Explorer or another trusted RPC. New trades stay locked.',
};
export default function DevnetPage() {
  const { connection } = useConnection();
  const { publicKey, disconnect } = useWallet();
  const wallet = publicKey?.toBase58() || '';
  const scope = useRef(wallet);
  const previousWallet = useRef(wallet);
  const checkingRef = useRef(false);
  useLayoutEffect(() => {
    scope.current = wallet;
    return () => {
      scope.current = null;
    };
  }, [wallet]);
  const [manifest, setManifest] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [intent, setIntent] = useState(null);
  const [pending, setPending] = useState(null);
  const [pendingIssue, setPendingIssue] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [result, setResult] = useState('');
  const [checking, setChecking] = useState(false);
  const refresh = useCallback(
    async (configuration) => {
      await verifyNetwork(connection, configuration);
      const owner = wallet ? new PublicKey(wallet) : null;
      const values = await Promise.all(
        configuration.markets.map(async (market) => {
          const state = await readMarket(connection, configuration, market);
          const holding = owner
            ? decodeHolding(
                await connection.getAccountInfo(tokenAddress(owner, market), 'confirmed'),
                owner,
                market,
              )
            : null;
          return { ...market, ...state, holding, holdingWallet: wallet };
        }),
      );
      return values;
    },
    [connection, wallet],
  );
  useEffect(() => {
    let active = true;
    loadManifest(DEVNET_MANIFEST_URL)
      .then(async (configuration) => {
        await verifyNetwork(connection, configuration);
        if (active) setManifest(configuration);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connection]);
  useEffect(() => {
    if (!manifest) return;
    let active = true;
    const load = () =>
      refresh(manifest)
        .then((values) => {
          if (active) {
            setMarkets(values);
            setError('');
          }
        })
        .catch((failure) => {
          if (active) setError(failure.message);
        });
    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [manifest, refresh]);
  useEffect(() => {
    if (!manifest) return;
    const previous = previousWallet.current;
    previousWallet.current = wallet;
    const read = () => {
      try {
        const saved = wallet ? readPending(localStorage, manifest, wallet) : null;
        setPending(saved);
        setResult(saved ? 'pending' : '');
        setReceipt(null);
        setPendingIssue('');
      } catch (failure) {
        setPendingIssue(failure.message);
      }
    };
    const timer = setTimeout(() => {
      setReceipt(null);
      setResult('');
      setChecking(false);
      if (previous && previous !== wallet) setIntent(null);
      read();
    }, 0);
    window.addEventListener('storage', read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', read);
    };
  }, [manifest, wallet]);
  const check = useCallback(async () => {
    if (checkingRef.current || !pending || scope.current !== pending.wallet) return;
    checkingRef.current = true;
    setChecking(true);
    setPendingIssue('');
    try {
      const response = await reconcile(connection, manifest, pending);
      if (!navigator.locks)
        throw new Error('This browser cannot safely coordinate transaction recovery across tabs.');
      let settled = false;
      await navigator.locks.request(
        pendingKey(manifest, pending.wallet),
        { ifAvailable: true },
        (lease) => {
          if (!lease) return;
          const saved = readPending(localStorage, manifest, pending.wallet);
          if (saved && saved.signature !== pending.signature) {
            if (scope.current === pending.wallet) {
              setPending(saved);
              setResult('pending');
              setReceipt(null);
            }
            return;
          }
          settled = ['finalized', 'failed'].includes(response.state);
          if (settled) clearPending(localStorage, manifest, pending.wallet, pending.signature);
          if (scope.current !== pending.wallet) return;
          setResult(response.state);
          if (settled) {
            setReceipt(pending);
            setPending((current) => (current?.signature === pending.signature ? null : current));
          }
        },
      );
      if (settled && scope.current === pending.wallet) {
        const values = await refresh(manifest);
        if (scope.current === pending.wallet) setMarkets(values);
      }
    } catch (failure) {
      if (scope.current === pending.wallet)
        setPendingIssue(
          `${failure.message} The saved signature is retained; do not submit a duplicate.`,
        );
    } finally {
      checkingRef.current = false;
      if (scope.current === pending.wallet) setChecking(false);
    }
  }, [connection, manifest, pending, refresh]);
  useEffect(() => {
    if (!pending) return;
    const immediate = setTimeout(check, 0);
    const interval = setInterval(check, 5000);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [pending, check]);
  return (
    <div className="devnet-page">
      <BackgroundVideo />
      <Header title="Artist tokens" devnet />
      <main className="devnet-content">
        <section className="service-panel devnet-intro">
          <span className="artist-genre">SOLANA DEVNET</span>
          <h2>Real transactions. Test funds.</h2>
          <p className="service-muted">
            Explore registered artist markets, then connect your wallet when you want to buy or
            sell. These tokens use devnet SOL, not real money.
          </p>
          <Link to="/">Back to paper discovery</Link>
          {wallet && (
            <p className="service-muted devnet-address">
              Wallet {wallet}{' '}
              <button className="devnet-text-button" onClick={() => disconnect()}>
                Disconnect
              </button>
            </p>
          )}
        </section>
        {loading && (
          <p role="status" className="service-muted">
            Checking the devnet deployment…
          </p>
        )}
        {error && (
          <p role="alert" className="service-error">
            {error}
          </p>
        )}
        {!loading && manifest && !manifest.markets.length && (
          <section className="service-panel">
            <h2>No registered devnet markets yet</h2>
            <p className="service-muted">
              An operator needs to register an artist and publish its verified market manifest.
            </p>
          </section>
        )}
        {(pending || receipt || pendingIssue) && (
          <section className="service-panel" aria-label="Devnet transaction status">
            <h2>{pending ? 'Transaction in progress' : 'Transaction result'}</h2>
            <p
              role="status"
              className={result === 'finalized' ? 'service-success' : 'service-muted'}
            >
              {statusText[result] || 'Check the saved signature before placing another trade.'}
            </p>
            {(pending || receipt) && (
              <a href={explorer((pending || receipt).signature)} target="_blank" rel="noreferrer">
                View transaction on Solana Explorer ↗
              </a>
            )}
            {pending && (
              <button className="service-button" disabled={checking} onClick={check}>
                {checking ? 'Checking chain…' : 'Check transaction result'}
              </button>
            )}
            {pendingIssue && (
              <p className="service-error" role="alert">
                {pendingIssue}
              </p>
            )}
          </section>
        )}
        <div className="devnet-markets">
          {markets.map((market) => (
            <article className="service-panel devnet-market" key={market.artist_profile}>
              <div className="devnet-market-title">
                <h2>{market.name}</h2>
                <span className="artist-genre">{market.symbol}</span>
              </div>
              <dl className="quote-list">
                <div>
                  <dt>Curve supply</dt>
                  <dd>{market.supply.toString()} tokens</dd>
                </div>
                <div>
                  <dt>Next token, fee included</dt>
                  <dd>
                    {market.supply < 100000n
                      ? `${sol(curveQuote(market.supply, 1n, 'buy').total)} devnet SOL`
                      : 'Supply cap reached'}
                  </dd>
                </div>
                {market.holding !== null && market.holdingWallet === wallet && (
                  <div>
                    <dt>Your on-chain tokens</dt>
                    <dd>{market.holding.toString()}</dd>
                  </div>
                )}
              </dl>
              <div className="trade-actions">
                <button
                  className="card-buy"
                  disabled={Boolean(pending || pendingIssue || error) || market.supply >= 100000n}
                  onClick={() => {
                    setReceipt(null);
                    setResult('');
                    setIntent({ market, side: 'buy' });
                  }}
                >
                  Buy
                </button>
                <button
                  className="card-sell"
                  disabled={Boolean(pending || pendingIssue || error)}
                  onClick={() => {
                    setReceipt(null);
                    setResult('');
                    setIntent({ market, side: 'sell' });
                  }}
                >
                  Sell
                </button>
              </div>
              <details className="devnet-identity">
                <summary>Verified market addresses</summary>
                <p>Artist {market.artist_authority}</p>
                <p>Mint {market.token_mint}</p>
                <p>Program {manifest.program_id}</p>
              </details>
            </article>
          ))}
        </div>
      </main>
      <Navbar />
      {intent && manifest && (
        <DevnetTradeDialog
          key={`${intent.market.symbol}:${intent.side}`}
          manifest={manifest}
          market={intent.market}
          side={intent.side}
          pending={pending}
          pendingIssue={pendingIssue}
          onClose={() => {
            if (scope.current === wallet) setIntent(null);
          }}
          onPending={(item) => {
            if (scope.current !== item.wallet) return;
            setPending(item);
            setResult('pending');
            setReceipt(null);
          }}
        />
      )}
    </div>
  );
}
