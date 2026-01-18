import React, { useState } from 'react';
import { useArtistProgram } from '../hooks/useArtistProgram';

const ArtistCard = ({ artist, onSelect }) => {
    const { buyToken, sellToken } = useArtistProgram();
    const [amount, setAmount] = useState('10');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleBuy = async (e) => {
        e.stopPropagation(); // Prevent card select
        setLoading(true);
        setMessage('');
        try {
            await buyToken(artist.walletAddress, amount); // Using walletAddress (assuming it links to mint authority logic) or mintAddress if needed
            // NOTE: In the hook I used wallet.publicKey as artist authority. 
            // If the artist is SOMEONE ELSE, we need their public key.
            // My hook implementation of buyToken derived the PDA from the passed key.
            // So passing `artist.walletAddress` is correct if that's the authority.
            setMessage(`Bought ${amount} shares!`);
        } catch (error) {
            console.error(error);
            setMessage('Error buying shares');
        } finally {
            setLoading(false);
        }
    };

    const handleSell = async (e) => {
        e.stopPropagation();
        setLoading(true);
        setMessage('');
        try {
            await sellToken(artist.walletAddress, amount);
            setMessage(`Sold ${amount} shares!`);
        } catch (error) {
            console.error(error);
            setMessage('Error selling shares');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="artist-card" onClick={() => onSelect && onSelect(artist)}>
            <div style={{
                height: '140px', // Reduced height since no image
                backgroundColor: '#111', // Fallback dark
                backgroundImage: artist.image ? `url(${artist.image})` : 'linear-gradient(45deg, #1a1a1a, #2a2a2a)', // Subtle gradient if no image
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '10px 10px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {!artist.image && <span style={{ fontSize: '2rem', opacity: 0.2 }}>🎵</span>}
            </div>
            <div style={{ padding: '15px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: '0 0 5px 0' }}>{artist.name}</h3>
                    <span className="badge">{artist.genre}</span>
                </div>

                <p style={{ fontSize: '0.9em', color: '#666', height: '40px', overflow: 'hidden' }}>{artist.description}</p>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.9em', fontWeight: 'bold', marginBottom: '10px' }}>
                    <span>Price: {artist.sharePrice.toFixed(4)} SOL</span>
                    <span>Supporters: {artist.supporters}</span>
                </div>

                <div className="trade-actions" style={{ display: 'flex', gap: '5px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        style={{ width: '50px', padding: '5px' }}
                    />
                    <button onClick={handleBuy} disabled={loading} style={{ flex: 1, cursor: 'pointer', background: '#333', color: 'white', border: 'none', padding: '5px', borderRadius: '4px' }}>
                        {loading ? '...' : 'Buy'}
                    </button>
                    <button onClick={handleSell} disabled={loading} style={{ flex: 1, cursor: 'pointer', background: '#ccc', color: 'black', border: 'none', padding: '5px', borderRadius: '4px' }}>
                        {loading ? '...' : 'Sell'}
                    </button>
                </div>
                {message && <div style={{ fontSize: '0.8em', marginTop: '5px', color: message.includes('Error') ? 'red' : 'green' }}>{message}</div>}
            </div>
        </div>
    );
};

export default ArtistCard;
