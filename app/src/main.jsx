import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Solana Imports
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import {
  WalletModalProvider,
} from '@solana/wallet-adapter-react-ui';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

const AppWithProvider = () => {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'.
  const network = WalletAdapterNetwork.Localnet;

  // You can also provide a custom RPC endpoint.
  const endpoint = "http://127.0.0.1:8899";

  const wallets = useMemo(
    () => [
      /**
       * Wallets that support the standard wallet adapter interface will be automatically
       * detected correctly by the wallet adapter.
       */
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppWithProvider />
  </StrictMode>,
)
