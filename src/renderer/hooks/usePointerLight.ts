import { useEffect } from 'react';

import { prefersReducedMotion } from '../gl/shaderLoop';

/**
 * Publishes the pointer position as --mx / --my on <html> (once per frame). Glass
 * surfaces use it for a specular highlight that follows the cursor.
 */
export function usePointerLight(): void {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const root = document.documentElement;
    let frame = 0;
    let x = -999;
    let y = -999;

    const flush = () => {
      frame = 0;
      root.style.setProperty('--mx', `${x}px`);
      root.style.setProperty('--my', `${y}px`);
    };
    const onMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const onLeave = () => {
      x = -999;
      y = -999;
      if (!frame) frame = requestAnimationFrame(flush);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);
}
