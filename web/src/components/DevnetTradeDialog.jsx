import { useEffect, useId, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { prepareTrade, submitTrade, sol, pendingKey } from '../devnet/client';
import GlassDialog from './GlassDialog';
import './TradeDialog.css';

export default function DevnetTradeDialog({
  manifest,
  market,
  side,
  onClose,
  onPending,
  pending,
  pendingIssue,
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const quantityId = useId();
  const [amount, setAmount] = useState('1');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const lock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const sameWallet = quote?.wallet === publicKey?.toBase58();
  const seconds = quote ? Math.max(0, Math.floor(quote.expiresAt - clock / 1000)) : 0;
  async function preview() {
    if (lock.current || !publicKey) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setQuote(null);
    try {
      const result = await prepareTrade(connection, manifest, market, publicKey, side, amount);
      setQuote(result);
      setClock(Date.now());
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (lock.current || !quote || !sameWallet || seconds <= 0 || !publicKey || !signTransaction)
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (!navigator.locks)
        throw new Error(
          'This browser cannot safely coordinate trades across tabs. Use a current browser over HTTPS.',
        );
      await navigator.locks.request(
        pendingKey(manifest, publicKey.toBase58()),
        { ifAvailable: true },
        async (lease) => {
          if (!lease)
            throw new Error('A trade is being signed in another tab. Wait for it to finish.');
          await submitTrade({
            connection,
            manifest,
            market,
            wallet: publicKey,
            signTransaction,
            quote,
            storage: localStorage,
            onPending,
          });
        },
      );
      onClose();
    } catch (failure) {
      setError(failure.message);
      setQuote(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <GlassDialog
      title={`${side === 'buy' ? 'Buy' : 'Sell'} ${market.symbol} · Devnet`}
      onClose={onClose}
      busy={busy}
    >
      <p className="service-muted">
        Wallet-signed test trade. Devnet SOL and tokens have no real monetary value.
      </p>
      {!connected ? (
        <button className="service-button" onClick={() => setVisible(true)}>
          Connect wallet to trade
        </button>
      ) : !signTransaction ? (
        <p className="service-error" role="alert">
          Choose a wallet that supports signing Solana transactions.
        </p>
      ) : pending || pendingIssue ? (
        <p className="service-muted">
          Resolve your saved transaction on the devnet page before making another trade.
        </p>
      ) : (
        <>
          <div className="trade-quantity-editor">
            <label htmlFor={quantityId}>Whole tokens to {side}</label>
            <div className="trade-quantity-row">
              <input
                id={quantityId}
                type="number"
                inputMode="numeric"
                min="1"
                max="10000"
                step="1"
                value={amount}
                disabled={busy}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setQuote(null);
                  setError('');
                }}
              />
            </div>
          </div>
          {quote && sameWallet && (
            <dl className="quote-list">
              <div>
                <dt>Curve amount</dt>
                <dd>{sol(quote.gross)} SOL</dd>
              </div>
              <div>
                <dt>Platform fee (5%)</dt>
                <dd>{sol(quote.fee)} SOL</dd>
              </div>
              <div className="quote-total">
                <dt>{side === 'buy' ? 'Maximum trade debit' : 'Minimum sale proceeds'}</dt>
                <dd>{sol(quote.total)} SOL</dd>
              </div>
              <div>
                <dt>Estimated network fee</dt>
                <dd>{sol(quote.networkFee)} SOL</dd>
              </div>
              <div>
                <dt>New token account rent</dt>
                <dd>{sol(quote.accountRent)} SOL</dd>
              </div>
              <div>
                <dt>Wallet devnet SOL</dt>
                <dd>{sol(quote.available)} SOL</dd>
              </div>
              <div>
                <dt>Your on-chain tokens</dt>
                <dd>
                  {quote.held.toString()} {market.symbol}
                </dd>
              </div>
            </dl>
          )}
          {quote && sameWallet && seconds > 0 ? (
            <>
              <button
                className={`service-button ${side === 'buy' ? 'buy-button' : ''}`}
                onClick={confirm}
                disabled={busy}
              >
                {busy ? 'Waiting for wallet…' : `Sign ${side} on devnet`}
              </button>
              <p className="service-muted">
                Quote expires in {seconds}s. The program enforces this limit. Network fees and
                account rent are additional; a failed transaction can still cost a network fee.
              </p>
            </>
          ) : (
            <button className="service-button" onClick={preview} disabled={busy}>
              {busy ? 'Checking chain and simulating…' : quote ? 'Refresh quote' : 'Preview trade'}
            </button>
          )}
        </>
      )}
      {error && (
        <p className="service-error" role="alert">
          {error}
        </p>
      )}
    </GlassDialog>
  );
}
