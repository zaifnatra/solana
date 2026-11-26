import { useState } from 'react';
import { useTrading } from '../state/TradingContext';
import './ServiceUI.css';

export default function AccountStart() {
  const { createAccount } = useTrading();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function start() {
    setBusy(true);
    setError('');
    try {
      await createAccount();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="service-panel paper-account-start">
      <h2>Make it your collection.</h2>
      <p className="service-muted">
        Start a paper account with 100 practice SOL. Follow artists, build a collection, and try
        trading without spending real funds.
      </p>
      <button className="buy-button" onClick={start} disabled={busy}>
        {busy ? 'Creating account…' : 'Start paper account'}
      </button>
      <p className="service-muted">
        Access is saved in this browser. Clearing browser data loses access to this paper account.
        Connecting a Solana wallet does not change this paper balance.
      </p>
      {error && (
        <p role="alert" className="service-error">
          {error}
        </p>
      )}
    </div>
  );
}
