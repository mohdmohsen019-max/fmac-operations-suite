import React, { useEffect, useRef, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';

/*
 * FMACLogo — official FMAC wordmark, animated
 * ----------------------------------------------------------------------------
 * Matches the brand logo: heavy condensed letters at one uniform oblique slant,
 * tight even spacing. F/C ink, M/A red.
 *
 * Motion:
 *   - "Assembly Strike" on mount: letters slam in one by one (F → M → C → A,
 *     0.08s stagger, spring) then a single red shockwave radiates from center.
 *   - Hover a letter: that letter jumps up and back down.
 *   - Idle: after 3.5s with no hover, the letters bounce in sequence
 *     (F up→down, M rising as F falls, then A, then C) and loops.
 *
 * Props:
 *   size  : "sm" | "md" | "lg"            — base font size via clamp()
 *   theme : "auto" | "dark" | "light"     — "auto" (default) tracks the live
 *                                           data-theme attribute; F/C flip
 *                                           black <-> white. M/A stay red.
 *
 * Framer Motion only.
 */

const FONT_SIZES = {
  sm: 'clamp(48px, 10vw, 72px)',
  md: 'clamp(64px, 12vw, 96px)',
  lg: 'clamp(80px, 14vw, 120px)',
};

const RED = '#c0392b';
const SLANT = -11;           // uniform oblique slant (deg) — matches the wordmark
const SPRING = { type: 'spring', stiffness: 400, damping: 20 };

// Idle "wave" timing — slow & cozy. Each letter peaks as the previous falls.
const IDLE_DELAY = 3500;     // ms of no hover before the wave begins
const WAVE_DUR = 1.6;        // s per single float (slow rise + fall)
const WAVE_OFFSET = 0.8;     // s between letters (= WAVE_DUR / 2 → peak handoff)
const WAVE_GAP = WAVE_OFFSET * 4 - WAVE_DUR; // keeps the loop seamless
const WAVE_JUMP = '-26%';    // gentle lift, not a hard jump
const WAVE_EASE = [0.45, 0, 0.55, 1]; // soft sine-like in/out
const HOVER_JUMP = '-48%';

// Visual reading order F · M · A · C. `delay` = landing sequence (F→M→C→A).
const LETTERS = [
  { char: 'F', tone: 'ink', from: { x: -120, y: -100, rotate: -34 }, delay: 0.00, z: 4 },
  { char: 'M', tone: 'red', from: { x: 0, y: -160, rotate: 10 }, delay: 0.08, z: 2 },
  { char: 'A', tone: 'red', from: { x: 0, y: 160, rotate: -10 }, delay: 0.24, z: 3 },
  { char: 'C', tone: 'ink', from: { x: 150, y: 40, rotate: 26 }, delay: 0.16, z: 4 },
];

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
  // One controls instance per letter so they animate independently.
  const ctrlF = useAnimation();
  const ctrlM = useAnimation();
  const ctrlA = useAnimation();
  const ctrlC = useAnimation();
  const ctrlShock = useAnimation();
  const letterControls = [ctrlF, ctrlM, ctrlA, ctrlC];

  const liveTheme = useLiveTheme(theme);
  const inkColor = liveTheme === 'light' ? '#1a1a1a' : '#ffffff';

  const landedRef = useRef(false);
  const hoveringRef = useRef(false);
  const wavingRef = useRef(false);
  const idleTimerRef = useRef(null);

  const cancelIdle = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  const startWave = () => {
    if (!landedRef.current || hoveringRef.current) return;
    wavingRef.current = true;
    letterControls.forEach((c, i) => {
      // Creative touch: the letter doesn't just bob — it gently lifts off
      // (soft scale-up + a slight sway tilt), like it's taking a slow breath.
      c.start({
        y: ['0%', WAVE_JUMP, '0%'],
        scale: [1, 1.05, 1],
        rotate: [0, -2.5, 0],
        transition: {
          duration: WAVE_DUR,
          ease: WAVE_EASE,
          repeat: Infinity,
          repeatDelay: WAVE_GAP,
          delay: i * WAVE_OFFSET,
        },
      });
    });
  };

  const stopWave = () => {
    if (!wavingRef.current) return;
    wavingRef.current = false;
    letterControls.forEach((c) => {
      c.stop();
      c.start({
        y: '0%',
        scale: 1,
        rotate: 0,
        transition: { duration: 0.35, ease: WAVE_EASE },
      });
    });
  };

  const scheduleIdle = () => {
    cancelIdle();
    idleTimerRef.current = setTimeout(startWave, IDLE_DELAY);
  };

  // Assembly Strike on mount, then arm the idle wave.
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all(
        LETTERS.map((L, i) =>
          letterControls[i].start({
            x: 0,
            y: 0,
            rotate: 0,
            skewX: SLANT,
            opacity: 1,
            transition: { ...SPRING, delay: L.delay },
          })
        )
      );
      if (!alive) return;
      landedRef.current = true;
      ctrlShock.start({
        scale: [0, 2],
        opacity: [0.4, 0],
        transition: { duration: 0.4, ease: 'easeOut' },
      });
      scheduleIdle();
    })();
    return () => {
      alive = false;
      cancelIdle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogoHoverStart = () => {
    hoveringRef.current = true;
    cancelIdle();
    stopWave();
  };

  const handleLogoHoverEnd = () => {
    hoveringRef.current = false;
    scheduleIdle();
  };

  const jumpLetter = (i) => {
    if (!landedRef.current) return;
    const c = letterControls[i];
    c.stop();
    c.start({
      y: ['0%', HOVER_JUMP, '0%'],
      scale: [1, 1.08, 1],
      rotate: [0, -3, 0],
      transition: { duration: 0.62, ease: [0.33, 1, 0.68, 1] },
    });
  };

  const fontSize = FONT_SIZES[size] || FONT_SIZES.md;

  return (
    <motion.div
      onHoverStart={handleLogoHoverStart}
      onHoverEnd={handleLogoHoverEnd}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        direction: 'ltr',           // keep F M A C order even in RTL (Arabic) layouts
        fontFamily: "'Anton', 'Inter', sans-serif",
        fontStyle: 'normal',        // slant comes from skewX so it's uniform & precise
        fontWeight: 700,
        fontSize,
        lineHeight: 1,
        letterSpacing: '-0.01em',
        userSelect: 'none',
        cursor: 'pointer',
        padding: '0.2em 0.32em',
      }}
    >
      {/* Red shockwave — fires once after the last letter lands */}
      <motion.span
        aria-hidden
        initial={{ scale: 0, opacity: 0 }}
        animate={ctrlShock}
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
          initial={{ ...L.from, skewX: SLANT, opacity: 0 }}
          animate={letterControls[i]}
          onHoverStart={() => jumpLetter(i)}
          style={{
            display: 'inline-block',
            position: 'relative',
            marginLeft: i === 0 ? 0 : '-0.015em',
            zIndex: L.z,
            color: L.tone === 'red' ? RED : inkColor,
            textShadow:
              L.tone === 'red'
                ? '0 4px 18px rgba(192,57,43,0.32)'
                : liveTheme === 'light'
                ? '0 4px 14px rgba(0,0,0,0.16)'
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
