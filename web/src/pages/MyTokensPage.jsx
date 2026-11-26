import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Header from '../components/Header';
import ArtistCard from '../components/ArtistCard';
import ServiceNotice from '../components/ServiceNotice';
import AccountStart from '../components/AccountStart';
import { useTrading } from '../state/TradingContext';
import { formatSol } from '../engine';
import './MyTokensPage.css';

const signedSol = (value) =>
  value == null ? '—' : `${value > 0 ? '+' : ''}${formatSol(value)} SOL`;
const performanceClass = (value) => (value > 0 ? 'wallet-gain' : '');

export default function MyTokensPage() {
  const { token, account, artists, orders, loading, pending, setTradeIntent } = useTrading();
  const performance = account?.performance;
  function trade(symbol, side, quantity) {
    setTradeIntent({ symbol, side, quantity: Math.min(10000, quantity), key: crypto.randomUUID() });
  }
  const totalValue =
    account?.holdings.reduce((sum, holding) => sum + holding.liquidation_lamports, 0) || 0;
  return (
    <div className="service-page" style={{ paddingBottom: 100 }}>
      <div className="square-pattern-bg" />
      <div className="service-content">
        <Header title="My Tokens" />
        <ServiceNotice />
        {!token ? (
          <main className="service-column">
            <AccountStart />
          </main>
        ) : (
          <main>
            {!account && (
              <p className="service-column service-muted" role="status">
                {loading
                  ? 'Loading your portfolio…'
                  : 'Your portfolio could not be loaded. Use Retry above to reconnect.'}
              </p>
            )}
            <div className="wallet-section-padding">
              <section className="service-panel wallet-summary" aria-label="Portfolio overview">
                <div className="wallet-total">
                  <span>Total portfolio · paper SOL</span>
                  <strong>
                    {account ? formatSol(account.cash_lamports + totalValue) : '—'} SOL
                  </strong>
                  <p className="service-muted">Cash + estimated net sell value of your tokens</p>
                </div>
                <div>
                  <span>Available to trade</span>
                  <strong>{account ? formatSol(account.cash_lamports) : '—'} SOL</strong>
                </div>
                <div>
                  <span>Tokens · net sell value</span>
                  <strong>{account ? formatSol(totalValue) : '—'} SOL</strong>
                </div>
              </section>
              {performance && (
                <section
                  className="service-panel wallet-performance"
                  aria-label="Portfolio performance"
                >
                  <h2>Your performance</h2>
                  <dl>
                    <div>
                      <dt>Since you started</dt>
                      <dd className={performanceClass(performance.total_change_lamports)}>
                        {signedSol(performance.total_change_lamports)}
                      </dd>
                    </div>
                    <div>
                      <dt>Realized · completed sells</dt>
                      <dd className={performanceClass(performance.realized_pnl_lamports)}>
                        {signedSol(performance.realized_pnl_lamports)}
                      </dd>
                    </div>
                    <div>
                      <dt>Unrealized · current holdings</dt>
                      <dd className={performanceClass(performance.unrealized_pnl_lamports)}>
                        {signedSol(performance.unrealized_pnl_lamports)}
                      </dd>
                    </div>
                  </dl>
                  <details className="wallet-performance-method">
                    <summary>How returns are calculated</summary>
                    <p className="service-muted">
                      Compared with your starting {formatSol(performance.starting_balance_lamports)}{' '}
                      paper SOL. Fees are included. Cost basis uses the average amount paid for your
                      tokens. Values are estimates, not guaranteed sale proceeds.
                    </p>
                  </details>
                  {!performance.history_complete && (
                    <p className="service-muted">
                      Some older trade history is unavailable. Cost basis and related performance
                      are shown as — where they cannot be calculated.
                    </p>
                  )}
                </section>
              )}
            </div>
            <div className="tokens-grid">
              {account?.holdings.map((holding) => {
                const artist = artists.find((item) => item.symbol === holding.symbol);
                return artist ? (
                  <section
                    key={holding.symbol}
                    className="wallet-position"
                    aria-label={`${artist.name} position`}
                  >
                    <ArtistCard artist={artist} showActions={false} balance={holding.quantity} />
                    <div className="service-panel wallet-position-details">
                      <dl>
                        <div>
                          <dt>Net sell value</dt>
                          <dd>{formatSol(holding.liquidation_lamports)} SOL</dd>
                        </div>
                        <div>
                          <dt>Amount invested</dt>
                          <dd>
                            {holding.cost_basis_lamports == null
                              ? '—'
                              : `${formatSol(holding.cost_basis_lamports)} SOL`}
                          </dd>
                        </div>
                        <div>
                          <dt>Unrealized return</dt>
                          <dd className={performanceClass(holding.unrealized_pnl_lamports)}>
                            {signedSol(holding.unrealized_pnl_lamports)}
                          </dd>
                        </div>
                      </dl>
                      <div className="wallet-position-actions">
                        <button
                          className="buy-button"
                          disabled={Boolean(pending)}
                          onClick={() => trade(holding.symbol, 'buy', 10)}
                        >
                          Buy more
                        </button>
                        <button
                          disabled={Boolean(pending)}
                          onClick={() => trade(holding.symbol, 'sell', holding.quantity)}
                        >
                          Sell tokens
                        </button>
                      </div>
                    </div>
                  </section>
                ) : (
                  <div key={holding.symbol} className="service-panel">
                    <h3>{holding.symbol}</h3>
                    <p>{holding.quantity} legacy paper tokens</p>
                    <p className="service-muted">
                      This market is retained from an earlier sandbox. It is not part of the artist
                      directory.
                    </p>
                  </div>
                );
              })}
            </div>
            {account && !account.holdings.length && (
              <div className="service-column">
                <div className="service-panel empty-state">
                  <h2>{loading ? 'Loading your collection…' : 'Your collection starts here.'}</h2>
                  <p>
                    Find an artist you love. Your tokens and their performance will appear here.
                  </p>
                  <Link className="wallet-discover-link" to="/">
                    Explore artists →
                  </Link>
                </div>
              </div>
            )}
            <div className="wallet-section-padding">
              <section className="service-panel wallet-history">
                <h2>Trade receipts</h2>
                <p className="service-muted">
                  Your latest 100 paper trades. Balances and receipts are saved by the service.
                </p>
                {orders.length ? (
                  <div className="wallet-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Market</th>
                          <th>Quantity</th>
                          <th>Net amount</th>
                          <th>Fee</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order) => (
                          <tr key={order.id}>
                            <td>
                              {order.symbol}
                              <small>
                                {order.side.toUpperCase()} · {order.id.slice(0, 8)}
                              </small>
                            </td>
                            <td>{order.quantity}</td>
                            <td>{formatSol(order.total_lamports)} SOL</td>
                            <td>{formatSol(order.fee_lamports)} SOL</td>
                            <td>{new Date(order.created_at * 1000).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="service-muted">No trades yet.</p>
                )}
              </section>
            </div>
          </main>
        )}
        <Navbar />
      </div>
    </div>
  );
}
