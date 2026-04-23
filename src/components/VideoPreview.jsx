import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function VideoPreview({ youtubeId, children }) {
  const [hover, setHover] = useState(false);
  const [modal, setModal] = useState(false);
  const timeout = useRef(null);

  if (!youtubeId) return children;

  function handleEnter() {
    timeout.current = setTimeout(() => setHover(true), 400);
  }
  function handleLeave() {
    clearTimeout(timeout.current);
    setHover(false);
  }
  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(timeout.current);
    setHover(false);
    setModal(true);
  }

  return (
    <>
      <div
        className="relative cursor-pointer"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onClick={handleClick}
      >
        {children}
        {hover && (
          <div
            className="absolute left-full ml-1 top-0 z-50 bg-bg border border-border rounded-lg shadow-2xl overflow-hidden"
            style={{ width: 320, height: 180 }}
            onMouseEnter={() => clearTimeout(timeout.current)}
          >
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=1&modestbranding=1`}
              allow="autoplay"
              className="w-full h-full border-none"
              title="Preview"
            />
          </div>
        )}
      </div>

      {modal && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center"
          onClick={() => setModal(false)}
        >
          <div
            className="relative bg-bg rounded-lg overflow-hidden shadow-2xl"
            style={{ width: 854, maxWidth: '92vw', height: 480, maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute top-2 right-2 z-10 font-mono text-[11px] text-muted hover:text-text bg-bg/90 rounded px-2 py-1 cursor-pointer border border-border"
              onClick={() => setModal(false)}
            >
              ✕
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&controls=1&modestbranding=1`}
              allow="autoplay; fullscreen"
              className="w-full h-full border-none"
              title="Video"
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
