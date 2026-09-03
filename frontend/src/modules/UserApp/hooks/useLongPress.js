import { useRef, useCallback } from 'react';

/**
 * Custom hook for detecting long press gestures
 * @param {Function} onLongPress - Callback function when long press is detected
 * @param {Number} delay - Delay in milliseconds before triggering long press (default: 500)
 * @returns {Object} - Event handlers for touch and mouse events
 */
const useLongPress = (onLongPress, delay = 500) => {
  const timeoutRef = useRef(null);
  const targetRef = useRef(null);

  const start = useCallback((event) => {
    if (onLongPress) {
      const currentTarget = event.currentTarget;
      const target = event.target;
      const clientX = event.clientX || event.touches?.[0]?.clientX;
      const clientY = event.clientY || event.touches?.[0]?.clientY;
      timeoutRef.current = setTimeout(() => {
        onLongPress({
          ...event,
          currentTarget,
          target,
          clientX,
          clientY,
        });
      }, delay);
    }
  }, [onLongPress, delay]);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    targetRef.current = null;
  }, []);

  return {
    onMouseDown: start,
    onTouchStart: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchEnd: clear,
    onTouchCancel: clear,
  };
};

export default useLongPress;

