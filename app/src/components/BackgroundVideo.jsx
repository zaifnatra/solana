import React from 'react';
import './BackgroundVideo.css';

export default function BackgroundVideo() {
    return (
        <div className="video-background-container">
            <div className="app-bg-video" />
            <div className="video-gradient-overlay"></div>
        </div>
    );
}
