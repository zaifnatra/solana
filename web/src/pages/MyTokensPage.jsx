import Navbar from '../components/Navbar';
import Header from '../components/Header';
import ArtistCard from '../components/ArtistCard';
import ServiceNotice from '../components/ServiceNotice';
import AccountStart from '../components/AccountStart';
import { useTrading } from '../state/TradingContext';
import { formatSol } from '../engine';
import './MyTokensPage.css';

export default function MyTokensPage() {
  const { token, account, artists, orders, loading } = useTrading();
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
            <div className="wallet-section-padding">
              <section className="service-panel wallet-summary">
                <div>
                  <span>Available paper SOL</span>
                  <strong>{account ? formatSol(account.cash_lamports) : '—'} SOL</strong>
                </div>
                <div>
                  <span>Holdings · estimated net sell value</span>
                  <strong>{account ? formatSol(totalValue) : '—'} SOL</strong>
                </div>
              </section>
            </div>
            <div className="tokens-grid">
              {account?.holdings.map((holding) => {
                const artist = artists.find((item) => item.symbol === holding.symbol);
                return artist ? (
                  <ArtistCard
                    key={holding.symbol}
                    artist={artist}
                    showActions={false}
                    balance={holding.quantity}
                  />
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
            {!account?.holdings.length && (
              <div className="service-column">
                <div className="service-panel empty-state">
                  <h2>{loading ? 'Loading your collection…' : 'Your collection starts here.'}</h2>
                  <p>Buy an artist token from Discover and it will appear here.</p>
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
