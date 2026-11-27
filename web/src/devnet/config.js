const env = import.meta.env || {};
export const DEVNET_ENABLED = env.VITE_TRADING_MODE === 'devnet';
export const DEVNET_RPC_URL = env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const DEVNET_MANIFEST_URL = env.VITE_DEVNET_MANIFEST_URL || '/devnet-markets.json';

// Bound every devnet RPC request; ambiguous submissions remain in durable storage.
export function devnetRpcFetch(input, options = {}) {
  return fetch(input, {
    ...options,
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(12000)].filter(Boolean)),
  });
}
