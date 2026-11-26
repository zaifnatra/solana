import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import ProfilePage from './pages/ProfilePage';
import FriendsPage from './pages/FriendsPage';
import MyTokensPage from './pages/MyTokensPage';
import ArtistPage from './pages/ArtistPage';
import TradingProvider from './state/TradingProvider';
import TradeDialog from './components/TradeDialog';
import { useTrading } from './state/TradingContext';
import './components/ServiceUI.css';

function ActiveTrade() {
  const { tradeIntent, token } = useTrading();
  return tradeIntent ? (
    <TradeDialog
      key={`${token}:${tradeIntent.key || `${tradeIntent.symbol}-${tradeIntent.side}-${tradeIntent.quantity}`}`}
      intent={tradeIntent}
    />
  ) : null;
}

function AppRoutes() {
  const { token } = useTrading();
  return (
    <Routes key={token}>
      <Route path="/" element={<SearchPage />} />
      <Route path="/artists/:symbol" element={<ArtistPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route path="/my-tokens" element={<MyTokensPage />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TradingProvider>
        <div className="app-layout">
          <AppRoutes />
          <ActiveTrade />
        </div>
      </TradingProvider>
    </BrowserRouter>
  );
}
