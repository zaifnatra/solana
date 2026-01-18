import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { createUmiInstance } from '../utils/umi';
import { createNft } from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, percentAmount, createGenericFileFromBrowserFile } from '@metaplex-foundation/umi';
import { supabase } from '../supabaseClient';

const MintOneOfOne = () => {
    // ... existing hook calls ...
    const wallet = useWallet();
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [user, setUser] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        image: null,
        genre: 'Pop' // Default genre
    });

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        }
        getUser();
    }, []);

    const [mintAddress, setMintAddress] = useState(null);

    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFormData({ ...formData, image: e.target.files[0] });
        }
    };

    const handleMint = async () => {
        if (!wallet.connected) {
            alert('Please connect your wallet first!');
            return;
        }
        if (!formData.name || !formData.image) {
            alert('Please provide a name and image.');
            return;
        }

        setLoading(true);
        setStatus('Initializing Umi...');

        try {
            const umi = createUmiInstance(wallet);

            // 1. Upload Image
            setStatus('Uploading image to Irys (Devnet)...');

            // Convert Browser File to Umi GenericFile
            const genericFile = await createGenericFileFromBrowserFile(formData.image);

            const [imageUri] = await umi.uploader.upload([genericFile]);
            console.log('Image uploaded:', imageUri);

            // 2. Upload Metadata
            setStatus('Uploading metadata...');
            const metadata = {
                name: formData.name,
                description: formData.description,
                image: imageUri,
                properties: {
                    files: [
                        {
                            uri: imageUri,
                            type: file.type,
                        }
                    ]
                }
            };
            const metadataUri = await umi.uploader.uploadJson(metadata);
            console.log('Metadata uploaded:', metadataUri);

            // 3. Mint NFT
            setStatus('Minting NFT on-chain...');
            const mint = generateSigner(umi);

            const { signature } = await createNft(umi, {
                mint,
                name: formData.name,
                uri: metadataUri,
                sellerFeeBasisPoints: percentAmount(0), // 0% royalties for now
            }).sendAndConfirm(umi);

            setStatus('Success!');
            setMintAddress(mint.publicKey);
            console.log('Mint Signature:', signature);

            // 4. Save to Database (Enable Discovery)
            setStatus('Saving to Discover page...');

            if (user) {
                const { error: dbError } = await supabase
                    .from('artists')
                    .upsert({
                        artist_id: user.id,
                        mint_address: mint.publicKey.toString(),
                        genre: formData.genre,
                        total_backed: 0
                    }, { onConflict: 'artist_id' });

                if (dbError) {
                    console.error('DB Save Error:', dbError);
                    setStatus('Minted, but failed to list on Discover.');
                } else {
                    setStatus('Success! Listed on Discover.');
                }
            } else {
                console.warn("No Supabase user found, skipping DB save");
            }

        } catch (err) {
            console.error('Minting failed:', err);
            setStatus(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mint-container">
            <h3>Mint 1-of-1 NFT</h3>

            <div className="form-group">
                <label>Name</label>
                <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="My Masterpiece"
                />
            </div>

            <div className="form-group">
                <label>Description</label>
                <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Description of the artwork"
                />
            </div>

            <div className="form-group">
                <label>Image</label>
                <input type="file" onChange={handleImageChange} accept="image/*" />
            </div>

            <button disabled={loading} onClick={handleMint} className="action-button">
                {loading ? 'Processing...' : 'Mint NFT'}
            </button>

            {status && <p className="status-message">{status}</p>}

            {mintAddress && (
                <div className="success-box">
                    <p>Minted Successfully!</p>
                    <p>Address: {mintAddress}</p>
                    <a
                        href={`https://solscan.io/token/${mintAddress}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        View on Solscan
                    </a>
                </div>
            )}

            <style>{`
        .mint-container {
          max-width: 500px;
          margin: 0 auto;
          text-align: left;
        }
        .form-group {
          margin-bottom: 15px;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        .form-group input, .form-group textarea {
          width: 100%;
          padding: 8px;
          border-radius: 4px;
          border: 1px solid #ccc;
          background: #333; /* Dark mode assumption */
          color: white;
        }
        .action-button {
          width: 100%;
          padding: 10px;
          background: #e91e63;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
        }
        .action-button:disabled {
          background: #555;
          cursor: not-allowed;
        }
        .status-message {
          margin-top: 10px;
          font-style: italic;
        }
        .success-box {
          margin-top: 20px;
          padding: 15px;
          background: rgba(0, 255, 0, 0.1);
          border: 1px solid lime;
          border-radius: 4px;
        }
      `}</style>
        </div>
    );
};

export default MintOneOfOne;
