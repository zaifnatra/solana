import React from 'react';
import { MOCK_ARTISTS, MOCK_USER } from '../utils/mockData';

const PortfolioView = ({ wallet }) => {
    // In a real app, mockUser items would be fetched from chain
    const holdings = MOCK_USER.portfolio.map(item => {
        const artist = MOCK_ARTISTS.find(a => a.id === item.artistId);
        return {
            ...item,
            artist,
            value: (item.amount * artist.sharePrice).toFixed(2)
        };
    });

    const totalValue = holdings.reduce((acc, curr) => acc + parseFloat(curr.value), 0);

    return (
        <div style={{ textAlign: 'left', maxWidth: '800px', margin: '0 auto' }}>
            <h1>My Portfolio</h1>
            <div className="stats-box" style={{ background: '#222', padding: '20px', borderRadius: '10px', marginBottom: '30px' }}>
                <div style={{ fontSize: '0.9em', color: '#888' }}>Total Value</div>
                <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{totalValue} SOL</div>
            </div>

            <div className="holdings-list">
                {holdings.map((h, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '15px',
                        background: '#1a1a1a',
                        borderBottom: '1px solid #333',
                        marginBottom: '10px',
                        borderRadius: '5px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <img src={h.artist.image} style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover' }} />
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{h.artist.name}</div>
                                <div style={{ fontSize: '0.8em', color: '#888' }}>{h.amount} Shares</div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold' }}>{h.value} SOL</div>
                            <div style={{ fontSize: '0.8em', color: '#4CAF50' }}>+12.5%</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PortfolioView;
