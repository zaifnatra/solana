import { useTrading } from '../state/TradingContext';
export default function ServiceNotice() {
  const { error, reload, pending, setTradeIntent } = useTrading();
  return (
    <>
      {error && (
        <div className="service-notice service-error" role="alert">
          {error}
          <button onClick={reload}>Reconnect</button>
        </div>
      )}
      {pending && (
        <div className="service-notice">
          An earlier paper order needs its receipt checked.
          <button
            onClick={() =>
              setTradeIntent({
                symbol: pending.symbol,
                side: pending.side,
                quantity: pending.quantity,
              })
            }
          >
            Check order
          </button>
        </div>
      )}
    </>
  );
}
