import { useEffect, useRef } from 'react';
import './CinematicBackdrop.css';

/*
 * CinematicBackdrop — the shared "ember forge" atmosphere used by the
 * landing, login and ticket-submission pages.
 *
 * Layers (back to front):
 *   1. Aurora — two huge soft red/gold radial blobs slowly breathing (CSS)
 *   2. Embers — canvas particles drifting upward like sparks from a forge
 *   3. Spotlight — a faint radial glow that follows the cursor (desktop)
 *   4. Grain — static film-grain noise for texture
 *
 * Props:
 *   intensity : 0..1  — ember density / opacity multiplier (default 1)
 *   spotlight : bool  — enable the cursor spotlight (default true)
 *
 * Honors prefers-reduced-motion (renders only the static aurora + grain).
 * Pure decoration: pointer-events none, aria-hidden.
 */
export default function CinematicBackdrop({ intensity = 1, spotlight = true }) {
  const canvasRef = useRef(null);
  const spotRef = useRef(null);

  // ── Ember particles ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;

    const ctx = canvas.getContext('2d');
    let raf = 0;
    let W = 0;
    let H = 0;
    let particles = [];

    const COLORS = [
      [255, 122, 89],   // ember orange
      [201, 168, 76],   // gold
      [192, 57, 43],    // FMAC red
      [255, 200, 120],  // warm spark
    ];

    const spawn = (fromBottom = false) => {
      const c = COLORS[(Math.random() * COLORS.length) | 0];
      return {
        x: Math.random() * W,
        y: fromBottom ? H + 10 : Math.random() * H,
        r: 0.6 + Math.random() * 1.8,
        vy: 0.15 + Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 0.25,
        phase: Math.random() * Math.PI * 2,
        twinkle: 0.004 + Math.random() * 0.01,
        alpha: 0.25 + Math.random() * 0.5,
        c,
      };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(Math.min(90, (W * H) / 16000) * intensity);
      particles = Array.from({ length: Math.max(20, target) }, () => spawn(false));
    };

    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y -= p.vy;
        p.x += p.drift + Math.sin(p.phase) * 0.12;
        p.phase += p.twinkle * 8;
        if (p.y < -12 || p.x < -12 || p.x > W + 12) particles[i] = spawn(true);

        const flicker = 0.6 + 0.4 * Math.sin(p.phase * 2);
        const a = p.alpha * flicker * intensity;
        const [r, g, b] = p.c;

        // soft glow halo
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r},${g},${b},${a * 0.16})`;
        ctx.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2);
        ctx.fill();
        // core
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    tick();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [intensity]);

  // ── Cursor spotlight ───────────────────────────────────────────────
  useEffect(() => {
    if (!spotlight) return undefined;
    const el = spotRef.current;
    if (!el) return undefined;
    const onMove = (e) => {
      el.style.setProperty('--cb-x', `${e.clientX}px`);
      el.style.setProperty('--cb-y', `${e.clientY}px`);
      el.style.opacity = '1';
    };
    const onLeave = () => { el.style.opacity = '0'; };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [spotlight]);

  return (
    <div className="cb-root" aria-hidden="true">
      <div className="cb-aurora cb-aurora-red" />
      <div className="cb-aurora cb-aurora-gold" />
      <canvas ref={canvasRef} className="cb-embers" />
      {spotlight && <div ref={spotRef} className="cb-spotlight" />}
      <div className="cb-grain" />
    </div>
  );
}
