import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function FBVideoPreview({ videoId, picture, children }) {
  const [hover, setHover] = useState(false);
  const [modal, setModal] = useState(false);
  const timeout = useRef(null);

  if (!picture && !videoId) return children;

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
        {hover && picture && (
          <div
            className="absolute left-full ml-1 top-0 z-50 bg-bg border border-border rounded-lg shadow-2xl overflow-hidden"
            style={{ width: 240, height: 427 }}
            onMouseEnter={() => clearTimeout(timeout.current)}
          >
            <img src={picture} alt="" className="w-full h-full object-cover" />
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
            style={{ width: 360, height: 640, maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute top-2 right-2 z-10 font-mono text-[11px] text-muted hover:text-text bg-bg/90 rounded px-2 py-1 cursor-pointer border border-border"
              onClick={() => setModal(false)}
            >
              ✕
            </button>
            {videoId ? (
              <iframe
                src={`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(`https://www.facebook.com/video/${videoId}/`)}&show_text=false&width=360&height=640`}
                allow="autoplay; encrypted-media"
                className="w-full h-full border-none"
                title="Video"
              />
            ) : (
              <img src={picture} alt="" className="w-full h-full object-contain bg-black" />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
