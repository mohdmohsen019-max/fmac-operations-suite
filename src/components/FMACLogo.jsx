import React, { useEffect, useRef, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';

/*
 * FMACLogo — "Assembly Strike"
 * ----------------------------------------------------------------------------
 * Four bold italic letters (F M A C) slam into a readable overlapping stack one
 * by one with sharp, snappy spring timing, then a single red shockwave radiates
 * from center. After assembly the mark sits completely static (no idle loop).
 * On hover the letters shift apart ~3px and snap back.
 *
 * Props:
 *   size  : "sm" | "md" | "lg"            — base font size via clamp()
 *   theme : "auto" | "dark" | "light"     — "auto" (default) tracks the live
 *                                           data-theme attribute and flips the
 *                                           F/C ink color black <-> white.
 *
 * Framer Motion only. Animation plays once on mount via useAnimation + useEffect.
 */

const FONT_SIZES = {
  sm: 'clamp(48px, 10vw, 72px)',
  md: 'clamp(64px, 12vw, 96px)',
  lg: 'clamp(80px, 14vw, 120px)',
};

const RED = '#c0392b';

// Visual reading order: F · M · A · C
// `delay` follows the landing sequence (F → M → C → A), stagger 0.08s.
// `from` is the scattered start offset; `rest` is the final slight tilt.
const LETTERS = [
  { char: 'F', tone: 'ink', from: { x: -120, y: -100, rotate: -38 }, rest: -5, delay: 0.00, z: 4, spread: -4 },
  { char: 'M', tone: 'red', from: { x: 0, y: -160, rotate: 12 }, rest: 4, delay: 0.08, z: 2, spread: -1.5 },
  { char: 'A', tone: 'red', from: { x: 0, y: 160, rotate: -12 }, rest: -4, delay: 0.24, z: 3, spread: 1.5 },
  { char: 'C', tone: 'ink', from: { x: 150, y: 40, rotate: 30 }, rest: 5, delay: 0.16, z: 4, spread: 4 },
];

const SPRING = { type: 'spring', stiffness: 400, damping: 20 };

/* Tracks the live `data-theme` on <html> so the mark re-colors on toggle.
   An explicit "dark"/"light" prop overrides and skips observation. */
function useLiveTheme(override) {
  const [theme, setTheme] = useState(() => {
    if (override === 'dark' || override === 'light') return override;
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    if (override === 'dark' || override === 'light') {
      setTheme(override);
      return undefined;
    }
    if (typeof document === 'undefined') return undefined;

    const el = document.documentElement;
    const read = () => setTheme(el.getAttribute('data-theme') || 'dark');
    read();

    const observer = new MutationObserver(read);
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [override]);

  return theme;
}

export default function FMACLogo({ size = 'md', theme = 'auto' }) {
  const controls = useAnimation();
  const landedRef = useRef(false);
  const liveTheme = useLiveTheme(theme);

  useEffect(() => {
    let alive = true;
    (async () => {
      await controls.start('land');
      if (alive) landedRef.current = true;
    })();
    return () => { alive = false; };
  }, [controls]);

  const inkColor = liveTheme === 'light' ? '#1a1a1a' : '#ffffff';

  const handleHoverStart = () => {
    if (landedRef.current) controls.start('hover');
  };

  const fontSize = FONT_SIZES[size] || FONT_SIZES.md;

  return (
    <motion.div
      onHoverStart={handleHoverStart}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        direction: 'ltr',           // keep F M A C order even in RTL (Arabic) layouts
        fontFamily: "'Anton', 'Inter', sans-serif",
        fontStyle: 'italic',
        fontWeight: 700,
        fontSize,
        lineHeight: 1,
        letterSpacing: '0.06em',
        userSelect: 'none',
        cursor: 'pointer',
        padding: '0.18em 0.3em',
      }}
    >
      {/* Red shockwave — fires once after the last letter lands */}
      <motion.span
        aria-hidden
        custom={{ delay: 0.5 }}
        initial="scattered"
        animate={controls}
        variants={{
          scattered: { scale: 0, opacity: 0 },
          land: () => ({
            scale: [0, 2],
            opacity: [0.4, 0],
            transition: { delay: 0.5, duration: 0.4, ease: 'easeOut', times: [0, 1] },
          }),
          hover: { scale: 0, opacity: 0 },
        }}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '1.2em',
          height: '1.2em',
          marginTop: '-0.6em',
          marginLeft: '-0.6em',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${RED} 0%, rgba(192,57,43,0.35) 45%, transparent 70%)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {LETTERS.map((L, i) => (
        <motion.div
          key={L.char}
          custom={L}
          initial="scattered"
          animate={controls}
          variants={{
            scattered: (l) => ({ ...l.from, opacity: 0 }),
            land: (l) => ({
              x: 0,
              y: 0,
              rotate: l.rest,
              opacity: 1,
              transition: { ...SPRING, delay: l.delay },
            }),
            hover: (l) => ({
              x: [0, l.spread, 0],
              y: [0, l.spread * 0.5, 0],
              transition: { duration: 0.34, ease: 'easeOut' },
            }),
          }}
          style={{
            display: 'inline-block',
            position: 'relative',
            marginLeft: i === 0 ? 0 : '-0.04em',
            zIndex: L.z,
            color: L.tone === 'red' ? RED : inkColor,
            textShadow:
              L.tone === 'red'
                ? '0 4px 18px rgba(192,57,43,0.35)'
                : liveTheme === 'light'
                ? '0 4px 14px rgba(0,0,0,0.18)'
                : '0 4px 16px rgba(0,0,0,0.5)',
            willChange: 'transform',
          }}
        >
          {L.char}
        </motion.div>
      ))}
    </motion.div>
  );
}
