import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { mplCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';

// Create a Umi instance
export const createUmiInstance = (wallet) => {
    const umi = createUmi('https://api.devnet.solana.com')
        .use(mplTokenMetadata())
        .use(mplCandyMachine())
        .use(irysUploader());

    if (wallet) {
        umi.use(walletAdapterIdentity(wallet));
    }

    return umi;
};
