import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Prevent iOS Safari and mobile gesture pinch-to-zoom and long-press previews
if (typeof document !== 'undefined') {
  // 1. Prevent iOS gesture zoom (pinch-to-zoom)
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

  // 2. Prevent multi-finger pinch zoom
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // 3. Prevent double-tap to zoom across the app (except text inputs)
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        const isTextInput = e.target?.closest?.('input, textarea, [contenteditable="true"]');
        if (!isTextInput) {
          e.preventDefault();
          const clickTarget = e.target?.closest?.('button, a, [role="button"]');
          if (clickTarget) {
            clickTarget.click();
          }
        }
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // 4. Prevent desktop trackpad pinch zoom or Ctrl+Wheel zoom
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // 5. Prevent iOS long-press button/link preview callout popup
  window.addEventListener(
    'contextmenu',
    (e) => {
      const isTextInput = e.target?.closest?.('input, textarea, [contenteditable="true"]');
      if (!isTextInput) {
        e.preventDefault();
        return false;
      }
    },
    { capture: true }
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

