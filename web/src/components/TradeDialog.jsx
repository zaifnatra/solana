import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatSol, getQuote, placeOrder, validQuantity } from '../engine';
import { useTrading } from '../state/TradingContext';
import GlassDialog from './GlassDialog';
import './TradeDialog.css';

export default function TradeDialog({ intent }) {
  const { token, createAccount, account, pending, storePending, reload, setTradeIntent } =
    useTrading();
  const navigate = useNavigate();
  const quantityId = useId();
  const [amount, setAmount] = useState(String(intent.quantity));
  const [revision, setRevision] = useState(0);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const lock = useRef(false);
  const { symbol, side } = pending || intent;
  const quantity = pending?.quantity ?? amount;
  const quantityValid = validQuantity(quantity);
  const seconds = quote ? Math.max(0, quote.expires_at - now) : 0;
  const close = () => setTradeIntent(null);
  useEffect(() => {
    let active = true;
    if (token && !pending && !receipt && validQuantity(quantity)) {
      const timer = setTimeout(
        () =>
          getQuote(token, { symbol, side, quantity: Number(quantity) })
            .then((result) => {
              if (active) {
                setQuote(result);
                setNow(Math.floor(Date.now() / 1000));
              }
            })
            .catch((failure) => {
              if (active) setError(failure.message);
            }),
        250,
      );
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
    return () => {
      active = false;
    };
  }, [token, pending, receipt, symbol, side, quantity, revision]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  async function start() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await createAccount();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function refreshQuote() {
    setQuote(null);
    setError('');
    setRevision((value) => value + 1);
  }
  function changeQuantity(value) {
    if (busy || pending || value === amount) return;
    setAmount(value);
    setQuote(null);
    setError('');
  }
  async function confirm() {
    if (
      lock.current ||
      (!pending &&
        (!quote || seconds <= 0 || !quantityValid || quote.quantity !== Number(quantity)))
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const order = pending || {
        symbol: quote.symbol,
        side: quote.side,
        quantity: quote.quantity,
        limit_lamports: quote.total_lamports,
        expires_at: quote.expires_at,
        idempotency_key: crypto.randomUUID(),
      };
      storePending(order);
      const result = await placeOrder(token, order);
      storePending(null);
      setReceipt(result);
      setQuote(null);
      reload();
    } catch (failure) {
      if (failure.status && failure.status < 500) {
        storePending(null);
        setQuote(null);
      }
      setError(
        failure.status
          ? failure.message
          : 'Order status is unknown. Check the same order to retrieve its receipt safely.',
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const held = account?.holdings.find((item) => item.symbol === symbol)?.quantity || 0;
  const canAfford =
    !quote ||
    (side === 'buy'
      ? (account?.cash_lamports || 0) >= quote.total_lamports
      : held >= Number(quantity));
  return (
    <GlassDialog
      title={receipt ? 'Paper trade complete' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}
      onClose={close}
      busy={busy}
    >
      {token && !pending && !receipt && (
        <div className="trade-quantity-editor">
          <label htmlFor={quantityId}>Tokens to {side}</label>
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
              aria-invalid={!quantityValid}
              aria-describedby={!quantityValid ? `${quantityId}-error` : undefined}
              onChange={(event) => changeQuantity(event.target.value)}
            />
            <div className="trade-quantity-presets" aria-label="Quick quantities">
              {(side === 'sell' && held > 0
                ? [
                    ...(held >= 2 && held <= 20000
                      ? [{ label: 'Half', value: Math.floor(held / 2) }]
                      : []),
                    { label: held > 10000 ? '10,000' : 'All', value: Math.min(10000, held) },
                  ]
                : [1, 10, 100].map((value) => ({ label: String(value), value }))
              ).map((preset) => (
                <button
                  key={preset.label}
                  disabled={busy}
                  onClick={() => changeQuantity(String(preset.value))}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {!quantityValid && (
            <p id={`${quantityId}-error`} className="service-error">
              Enter 1–10,000 whole tokens.
            </p>
          )}
        </div>
      )}
      {!token ? (
        <>
          <p className="service-muted">
            Start a paper account with 100 practice SOL to try this trade. No real money moves and
            no wallet signature is requested.
          </p>
          <button className="service-button buy-button" onClick={start} disabled={busy}>
            {busy ? 'Creating account…' : 'Start paper account'}
          </button>
          <p className="service-muted">
            Your access is stored in this browser. Clearing browser data loses access to this paper
            account.
          </p>
        </>
      ) : receipt ? (
        <div role="status">
          <p className="service-success">
            {receipt.side === 'buy' ? 'Bought' : 'Sold'} {receipt.quantity} {receipt.symbol} tokens.
          </p>
          <p>{formatSol(receipt.total_lamports)} paper SOL · fee included</p>
          <span className="receipt-id">Receipt {receipt.id}</span>
          <button
            className="service-button"
            onClick={() => {
              close();
              navigate('/my-tokens');
            }}
          >
            View portfolio
          </button>
          <button className="service-button" onClick={close}>
            Done
          </button>
        </div>
      ) : pending ? (
        <>
          <p className="service-muted">
            Your order to {side} {quantity} {symbol} needs its result checked. Retrying uses the
            same order ID and cannot execute it twice.
          </p>
          <button className="service-button" onClick={confirm} disabled={busy}>
            {busy ? 'Checking order…' : 'Check order result'}
          </button>
        </>
      ) : quote ? (
        <>
          <p className="service-muted">Review your paper trade. This uses practice funds only.</p>
          <dl className="quote-list">
            <div>
              <dt>Quantity</dt>
              <dd>
                {quote.quantity} {symbol}
              </dd>
            </div>
            <div>
              <dt>Before fee</dt>
              <dd>{formatSol(quote.gross_lamports)} SOL</dd>
            </div>
            <div>
              <dt>Platform fee (5%)</dt>
              <dd>{formatSol(quote.fee_lamports)} SOL</dd>
            </div>
            <div>
              <dt>{side === 'buy' ? 'Available paper balance' : 'Your tokens'}</dt>
              <dd>
                {side === 'buy' ? `${formatSol(account?.cash_lamports)} SOL` : `${held} ${symbol}`}
              </dd>
            </div>
            <div className="quote-total">
              <dt>{side === 'buy' ? 'Maximum you pay' : 'Minimum you receive'}</dt>
              <dd>{formatSol(quote.total_lamports)} SOL</dd>
            </div>
          </dl>
          {!canAfford && (
            <p role="alert" className="service-error">
              {side === 'buy'
                ? 'Insufficient paper SOL for this order.'
                : 'You do not own enough tokens to sell this amount.'}
            </p>
          )}
          {seconds > 0 ? (
            <button
              className={`service-button ${side === 'buy' ? 'buy-button' : ''}`}
              onClick={confirm}
              disabled={busy || !canAfford}
            >
              {busy ? 'Submitting…' : `Confirm ${side}`}
            </button>
          ) : (
            <button className="service-button" onClick={refreshQuote} disabled={busy}>
              Refresh expired quote
            </button>
          )}
          <p className="service-muted">
            Quote expires in {seconds}s. If the price moves past your limit, the trade is rejected.
          </p>
        </>
      ) : !quantityValid ? (
        <p className="service-muted">Choose a quantity to see your total, including fees.</p>
      ) : !error ? (
        <p role="status" className="service-muted">
          Getting your quote…
        </p>
      ) : (
        <button className="service-button" onClick={refreshQuote} disabled={busy}>
          Get a fresh quote
        </button>
      )}
      {error && (
        <p role="alert" className="service-error">
          {error}
        </p>
      )}
    </GlassDialog>
  );
}
