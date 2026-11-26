import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearToken,
  createPaperAccount,
  getAccount,
  getArtists,
  getOrders,
  getProfile,
  readPending,
  readToken,
  savePending,
  saveToken,
  tokenStorageKey,
} from '../engine';
import { TradingContext } from './TradingContext';

export default function TradingProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [artists, setArtists] = useState([]);
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(null);
  const [ownArtist, setOwnArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [tradeIntent, setTradeIntent] = useState(null);
  const [pending, setPending] = useState(() => readPending(readToken()));
  const creating = useRef(null);
  const tokenRef = useRef(token);
  const identityEpoch = useRef(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const applyToken = useCallback((next, { keepIntent = false } = {}) => {
    if (tokenRef.current === next) return;
    tokenRef.current = next;
    identityEpoch.current += 1;
    setToken(next);
    setArtists([]);
    setAccount(null);
    setOrders([]);
    setProfile(null);
    setOwnArtist(null);
    setPending(readPending(next));
    setLoading(true);
    setError('');
    if (!keepIntent) setTradeIntent(null);
  }, []);
  const storePending = useCallback(
    (order) => {
      savePending(token, order);
      if (tokenRef.current === token) setPending(order);
    },
    [token],
  );
  const createAccount = useCallback(async () => {
    if (tokenRef.current) return tokenRef.current;
    if (!creating.current) {
      const epoch = identityEpoch.current;
      creating.current = createPaperAccount()
        .then((result) => {
          const latest = readToken();
          if (latest) {
            applyToken(latest);
            return latest;
          }
          if (epoch !== identityEpoch.current)
            throw new Error('Your paper account changed. Please try again.');
          saveToken(result.token);
          applyToken(result.token, { keepIntent: true });
          return result.token;
        })
        .finally(() => {
          creating.current = null;
        });
    }
    return creating.current;
  }, [applyToken]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === tokenStorageKey) {
        const next = readToken();
        applyToken(next);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [applyToken]);
  useEffect(() => {
    let cancelled = false;
    let timer;
    const epoch = identityEpoch.current;
    const isCurrent = () => !cancelled && epoch === identityEpoch.current;
    async function load() {
      try {
        const [list, wallet, history, identity] = await Promise.all([
          getArtists(token),
          token ? getAccount(token) : null,
          token ? getOrders(token) : null,
          token ? getProfile(token) : null,
        ]);
        if (!isCurrent()) return;
        setArtists(list.artists);
        setAccount(wallet);
        setOrders(history?.orders || []);
        setProfile(identity?.profile || null);
        setOwnArtist(identity?.artist || null);
        setError('');
      } catch (failure) {
        if (!isCurrent()) return;
        if (failure.status === 401) {
          const latest = readToken();
          if (latest !== token) {
            applyToken(latest);
            return;
          }
          clearToken();
          applyToken('');
        }
        setError(
          failure.status === 401
            ? 'This paper account is no longer available. Start a new account to continue.'
            : 'The service is unavailable. Displayed data may be out of date.',
        );
      } finally {
        if (isCurrent()) {
          setLoading(false);
          timer = setTimeout(load, 15000);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, version, applyToken]);
  return (
    <TradingContext.Provider
      value={{
        token,
        artists,
        account,
        orders,
        profile,
        ownArtist,
        loading,
        error,
        reload,
        version,
        createAccount,
        tradeIntent,
        setTradeIntent,
        pending,
        storePending,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
}
