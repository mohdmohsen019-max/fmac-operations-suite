import { useState, useEffect } from 'react';

/**
 * Returns true when the viewport width is at or below `breakpoint` (default 768px).
 * Used for conditional inline styles / chart props where a CSS media query can't reach.
 * Read-only; does not affect desktop layout.
 */
export default function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = (e) => setIsMobile(e.matches);

    // Sync immediately in case the width changed before the listener attached.
    setIsMobile(mql.matches);

    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari < 14 fallback
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [breakpoint]);

  return isMobile;
}
