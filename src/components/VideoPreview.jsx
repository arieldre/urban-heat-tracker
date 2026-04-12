import { useState, useRef } from 'react';

/**
 * Wraps a thumbnail image — on hover shows YouTube embed player popup.
 */
export default function VideoPreview({ youtubeId, children }) {
  const [show, setShow] = useState(false);
  const timeout = useRef(null);

  if (!youtubeId) return children;

  function handleEnter() {
    timeout.current = setTimeout(() => setShow(true), 400);
  }
  function handleLeave() {
    clearTimeout(timeout.current);
    setShow(false);
  }

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && (
        <div className="absolute left-[56px] top-0 z-50 bg-bg border border-border rounded-lg shadow-2xl overflow-hidden" style={{ width: 320, height: 180 }}>
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=1&modestbranding=1`}
            allow="autoplay"
            className="w-full h-full border-none"
            title="Preview"
          />
        </div>
      )}
    </div>
  );
}
