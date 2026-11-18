import React from 'react';
import './BackgroundVideo.css';

export default function BackgroundVideo() {
    return (
        <div className="video-background-container">
            <video
                className="app-bg-video"
                autoPlay
                loop
                muted
                playsInline
            >
                <source src="/images/background.mp4" type="video/mp4" />
            </video>
            <div className="video-gradient-overlay"></div>
        </div>
    );
}
