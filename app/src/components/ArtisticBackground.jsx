import React from 'react';
import './ArtisticBackground.css';

const ArtisticBackground = () => {
    return (
        <div className="artistic-bg-container">
            {/* Concentric Rings */}
            <div className="geo-ring ring-1"></div>
            <div className="geo-ring ring-2"></div>
            <div className="geo-ring ring-3"></div>

            {/* Filled Elements */}
            <div className="geo-circle-filled"></div>

            {/* Crossing Lines */}
            <div className="line-cross"></div>
            <div className="line-cross-2"></div>
        </div>
    );
};

export default ArtisticBackground;
