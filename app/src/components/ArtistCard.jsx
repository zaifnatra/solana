import React, { useState } from 'react';
import { useArtistProgram } from '../hooks/useArtistProgram';
import './ArtistCard.css';

const ArtistCard = ({ artist, onSelect, showActions = true, balance }) => {
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
            {/* Image Section (Left) */}
            <div style={{
                width: '35%',
                height: '100%',
                backgroundColor: '#222',
                backgroundImage: artist.image ? `url(${artist.image})` : 'linear-gradient(135deg, #1a1a1a 0%, #333 100%)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                {!artist.image && <span style={{ fontSize: '3rem', opacity: 0.5 }}>🎵</span>}
            </div>

            {/* Content Section (Right) */}
            <div style={{
                flex: 1,
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                textAlign: 'left'
            }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700' }}>{artist.name}</h3>
                        <span className="badge" style={{ background: 'rgba(100, 108, 255, 0.2)', color: '#aab0ff', padding: '4px 8px', borderRadius: '8px', fontSize: '0.8rem' }}>{artist.genre}</span>
                    </div>

                    <p style={{
                        fontSize: '0.95em',
                        color: '#ddd',
                        margin: 0,
                        lineHeight: '1.5',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                    }}>{artist.description}</p>
                </div>

                {/* Balance Display (Mock) */}
                {balance !== undefined && (
                    <div style={{
                        marginTop: 'auto',
                        paddingTop: '15px',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <span style={{ color: '#aaa', fontSize: '0.9rem' }}>Your Balance</span>
                        <span style={{
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                            color: '#4CAF50',
                            textShadow: '0 0 10px rgba(76, 175, 80, 0.3)'
                        }}>
                            {balance} TOKENS
                        </span>
                    </div>
                )}

                {showActions && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em', fontWeight: '600', marginBottom: '12px', color: '#eee', marginTop: balance ? '10px' : '0' }}>
                            <span>Price: {artist.sharePrice.toFixed(4)} SOL</span>
                            <span>{artist.supporters} Supporters</span>
                        </div>

                        <div className="trade-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                            {/* Custom Input with Swapped Arrows: Down on Top, Up on Bottom */}
                            <div className="custom-input-wrapper" onClick={e => e.stopPropagation()}>
                                <input
                                    className="custom-number-input"
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                                <div className="spin-btn-col">
                                    {/* TOP BUTTON: UP / INCREMENT */}
                                    <button
                                        className="spin-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAmount(prev => ((parseInt(prev) || 0) + 1).toString());
                                        }}
                                    >
                                        ▲
                                    </button>

                                    {/* BOTTOM BUTTON: DOWN / DECREMENT */}
                                    <button
                                        className="spin-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAmount(prev => Math.max(0, (parseInt(prev) || 0) - 1).toString());
                                        }}
                                    >
                                        ▼
                                    </button>
                                </div>
                            </div>
                            <button onClick={handleBuy} disabled={loading} style={{
                                flex: 1,
                                height: '36px', // explicit height
                                background: 'linear-gradient(45deg, #4CAF50, #45a049)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: '8px', border: 'none', cursor: 'pointer', color: 'white', fontWeight: 'bold'
                            }}>
                                {loading ? '...' : 'Buy'}
                            </button>
                            <button onClick={handleSell} disabled={loading} style={{
                                flex: 1,
                                height: '36px', // explicit height
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: '8px', cursor: 'pointer', color: 'white', fontWeight: 'bold'
                            }}>
                                {loading ? '...' : 'Sell'}
                            </button>
                        </div>
                        {message && <div style={{ fontSize: '0.8em', marginTop: '10px', textAlign: 'center', color: message.includes('Error') ? '#ff6b6b' : '#4cd964' }}>{message}</div>}
                    </>
                )}
            </div>
        </div>
    );
};

export default ArtistCard;
