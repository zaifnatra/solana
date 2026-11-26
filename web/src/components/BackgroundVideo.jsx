import { useEffect, useState } from 'react';
import './BackgroundVideo.css';

export default function BackgroundVideo() {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return (
    <div className="video-background-container" aria-hidden="true">
      {reducedMotion ? (
        <img className="app-bg-video" src="/images/background-poster.webp" alt="" />
      ) : (
        <video
          className="app-bg-video"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/images/background-poster.webp"
        >
          <source src="/images/background.mp4" type="video/mp4" />
        </video>
      )}
      <div className="video-gradient-overlay" />
    </div>
  );
}
