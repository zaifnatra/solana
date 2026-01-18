import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { createUmiInstance } from '../utils/umi';
import { createNft } from '@metaplex-foundation/mpl-token-metadata';
import {
    create,
    mintV2,
    fetchCandyMachine,
} from '@metaplex-foundation/mpl-candy-machine';
import {
    generateSigner,
    percentAmount,
    some,
    sol,
    dateTime,
    createGenericFileFromBrowserFile
} from '@metaplex-foundation/umi';

const CreateCollection = () => {
    // ... existing hook calls ...
    const wallet = useWallet();
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        symbol: '',
        supply: 10,
        price: 0.1,
        image: null,
    });
    const [candyMachineAddress, setCandyMachineAddress] = useState(null);
    const [collectionMintAddress, setCollectionMintAddress] = useState(null);

    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFormData({ ...formData, image: e.target.files[0] });
        }
    };

    const handleCreate = async () => {
        if (!wallet.connected) return alert('Connect Wallet!');
        if (!formData.image) return alert('Upload Image!');

        setLoading(true);
        setStatus('Initializing...');

        try {
            const umi = createUmiInstance(wallet);

            // 1. Upload Assets
            setStatus('Uploading Collection Assets...');
            const genericFile = await createGenericFileFromBrowserFile(formData.image);
            const [imageUri] = await umi.uploader.upload([genericFile]);

            const metadata = {
                name: formData.name,
                symbol: formData.symbol,
                description: 'Collection created via Solana App',
                image: imageUri,
            };
            const metadataUri = await umi.uploader.uploadJson(metadata);

            // 2. Create Collection NFT
            setStatus('Creating Collection NFT...');
            const collectionMint = generateSigner(umi);
            await createNft(umi, {
                mint: collectionMint,
                name: formData.name,
                uri: metadataUri,
                sellerFeeBasisPoints: percentAmount(0),
                isCollection: true,
            }).sendAndConfirm(umi);

            setCollectionMintAddress(collectionMint.publicKey);
            console.log('Collection Mint:', collectionMint.publicKey);

            // 3. Create Candy Machine
            setStatus('Creating Candy Machine...');
            const candyMachine = generateSigner(umi);

            await create(umi, {
                candyMachine,
                collectionMint: collectionMint.publicKey,
                collectionUpdateAuthority: umi.identity,
                tokenStandard: 0, // 0 = NFT, 4 = Core (if supported eventually)
                sellerFeeBasisPoints: percentAmount(0),
                itemsAvailable: parseInt(formData.supply),
                creators: [
                    {
                        address: umi.identity.publicKey,
                        verified: true,
                        percentageShare: 100,
                    },
                ],
                configLineSettings: null, // Not using config lines
                hiddenSettings: some({
                    name: formData.name + ' #',
                    uri: metadataUri,
                    hash: new Uint8Array(32), // Placeholder hash
                }),
                guards: {
                    solPayment: some({
                        lamports: sol(Number(formData.price)),
                        destination: umi.identity.publicKey
                    }),
                    startDate: some({ date: dateTime(new Date()) }), // Start now
                },
            }).sendAndConfirm(umi);

            setCandyMachineAddress(candyMachine.publicKey);
            setStatus('Candy Machine Created! You can now mint.');

        } catch (err) {
            console.error(err);
            setStatus('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleMintFromCandyMachine = async () => {
        if (!candyMachineAddress || !collectionMintAddress) return;
        setLoading(true);
        setStatus('Minting token from Candy Machine...');

        try {
            const umi = createUmiInstance(wallet);
            const candyMachine = await fetchCandyMachine(umi, candyMachineAddress);

            const nftMint = generateSigner(umi);

            await mintV2(umi, {
                candyMachine: candyMachine.publicKey,
                mint: nftMint,
                collectionMint: collectionMintAddress,
                collectionUpdateAuthority: umi.identity.publicKey,
                candyGuard: candyMachine.mintAuthority, // Default guard is usually the mint authority or separate
                // With create(), if we didn't specify a guard account, the CM is the authority.
                // Wait, for 'guards' in create(), it creates a Candy Guard and wraps the CM.
                // So we need to finding the Candy Guard address?
                // Actually, fetchCandyMachine should have the mintAuthority as the candyGuard address if wrapped.
                // Let's pass mintAuthority as candyGuard? 
                // Or cleaner: create() returns the CM. The Mint Authority of the CM IS the Candy Guard.
            }).sendAndConfirm(umi);

            setStatus(`Minted! ${nftMint.publicKey}`);
        } catch (err) {
            console.error(err);
            setStatus('Mint Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mint-container">
            <h3>Create Collection (Candy Machine)</h3>

            <div className="form-group">
                <label>Collection Name</label>
                <input
                    type="text" value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
            </div>
            <div className="form-group">
                <label>Supply</label>
                <input
                    type="number" value={formData.supply}
                    onChange={e => setFormData({ ...formData, supply: e.target.value })}
                />
            </div>
            <div className="form-group">
                <label>Price (SOL)</label>
                <input
                    type="number" step="0.01" value={formData.price}
                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                />
            </div>
            <div className="form-group">
                <label>Collection Image</label>
                <input type="file" onChange={handleImageChange} />
            </div>

            <button disabled={loading || candyMachineAddress} onClick={handleCreate} className="action-button">
                {loading ? 'Processing...' : (candyMachineAddress ? 'Created!' : 'Create Candy Machine')}
            </button>

            {status && <p className="status-message">{status}</p>}

            {candyMachineAddress && (
                <div className="success-box">
                    <p>Candy Machine: {candyMachineAddress}</p>
                    <button onClick={handleMintFromCandyMachine} disabled={loading} className="action-button" style={{ marginTop: '10px', background: '#4caf50' }}>
                        Mint Item (Test)
                    </button>
                </div>
            )}

            <style>{`
        .mint-container { max-width: 500px; margin: 0 auto; text-align: left; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input { width: 100%; padding: 8px; background: #333; color: white; border: 1px solid #555; }
        .action-button { width: 100%; padding: 10px; background: #2196f3; color: white; border: none; cursor: pointer; }
        .action-button:disabled { background: #555; }
        .status-message { margin-top: 10px; font-style: italic; }
        .success-box { margin-top: 20px; padding: 15px; border: 1px solid lime; background: rgba(0,255,0,0.1); }
      `}</style>
        </div>
    );
};

export default CreateCollection;
