import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';
import App from './App.jsx';
import { DEVNET_ENABLED, DEVNET_RPC_URL, devnetRpcFetch } from './devnet/config';

// Paper wallet connections retain their existing endpoint; enabled trading uses a devnet-only RPC boundary.
const endpoint = DEVNET_ENABLED
  ? DEVNET_RPC_URL
  : (import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8899');
const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConnectionProvider
      endpoint={endpoint}
      config={
        DEVNET_ENABLED
          ? { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: devnetRpcFetch }
          : undefined
      }
    >
      <WalletProvider wallets={wallets} autoConnect={!DEVNET_ENABLED}>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </StrictMode>,
);
