// The only boundary between the UI and the Rust paper-trading service.
const TOKEN_KEY = 'mtl.paper.token.v1';
export const readToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
export const tokenStorageKey = TOKEN_KEY;
const pendingKey = (token) => `mtl.paper.pending.${token.slice(0, 16)}`;
export function readPending(token) {
  if (!token) return null;
  try {
    return JSON.parse(sessionStorage.getItem(pendingKey(token)) || 'null');
  } catch {
    return null;
  }
}
export function savePending(token, order) {
  // Each tab keeps its own unresolved intent; another tab cannot overwrite it.
  if (order) sessionStorage.setItem(pendingKey(token), JSON.stringify(order));
  else sessionStorage.removeItem(pendingKey(token));
}
export async function api(path, { token = '', method = 'GET', body } = {}) {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || `The service returned ${response.status}. Please try again.`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
export const getArtists = (token) => api('artists', { token });
export const getArtist = (symbol, token) => api(`artists/${encodeURIComponent(symbol)}`, { token });
export const createPaperAccount = () => api('sessions', { method: 'POST', body: {} });
export const getAccount = (token) => api('account', { token });
export const getOrders = (token) => api('orders', { token });
export const getProfile = (token) => api('profile', { token });
export const updateProfile = (token, body) => api('profile', { token, method: 'PUT', body });
export const registerArtist = (token, body) => api('artists', { token, method: 'POST', body });
export const setFollowing = (token, symbol, following) =>
  api(`artists/${encodeURIComponent(symbol)}/follow`, {
    token,
    method: 'PUT',
    body: { following },
  });
export const getFeed = (token) => api('feed', { token });
export const publishRelease = (token, symbol, body) =>
  api(`artists/${encodeURIComponent(symbol)}/releases`, { token, method: 'POST', body });
export const getQuote = (token, body) => api('quotes', { token, method: 'POST', body });
export const placeOrder = (token, body) => api('orders', { token, method: 'POST', body });
export const formatSol = (value) =>
  ((value || 0) / 1e9).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
export const validQuantity = (value) =>
  /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 10000;
export const safeExternalUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};
