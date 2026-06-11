import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import './CustomSelect.css';

/*
 * CustomSelect — the single design-system dropdown used across the app.
 * Replaces native <select> so the option panel is fully themed.
 *
 * Props:
 *   value                 — current value
 *   onChange(value)       — called with the chosen value (NOT an event)
 *   options               — array of strings OR { value, label, disabled? }
 *   placeholder           — shown when nothing matches `value`
 *   disabled              — disables the trigger
 *   className, style      — forwarded to the container
 *   ariaLabel             — accessible label
 *
 * The panel renders in a portal (document.body, position: fixed) so it never
 * gets clipped by table cells, modals, or overflow containers, and flips up
 * when there isn't room below. Keyboard: ↑/↓ move, Enter/Space select, Esc close.
 */
export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select option',
  disabled = false,
  className = '',
  style = {},
  ariaLabel,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, openUp: false, maxHeight: 280 });
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const norm = options.map(opt =>
    typeof opt === 'object'
      ? { value: opt.value, label: opt.label, disabled: !!opt.disabled }
      : { value: opt, label: opt, disabled: false }
  );

  const selected = norm.find(o => o.value === value);
  const displayValue = selected ? selected.label : placeholder;
  const isRTL = typeof document !== 'undefined' && document.documentElement.getAttribute('dir') === 'rtl';

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(300, Math.max(160, (openUp ? spaceAbove : spaceBelow) - 16));
    setPos({
      top: r.bottom,
      bottom: window.innerHeight - r.top,
      left: r.left,
      right: window.innerWidth - r.right,
      width: r.width,
      vw: window.innerWidth,
      openUp,
      maxHeight,
    });
  }, []);

  // Reposition while open (covers ancestor scroll + window resize).
  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click (trigger + portal panel are both "inside").
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen]);

  const open = () => {
    if (disabled) return;
    updatePosition();
    const cur = norm.findIndex(o => o.value === value);
    setHighlight(cur);
    setIsOpen(true);
  };

  const choose = (opt) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const moveHighlight = (dir) => {
    setHighlight(prev => {
      let i = prev;
      for (let step = 0; step < norm.length; step++) {
        i = (i + dir + norm.length) % norm.length;
        if (!norm[i].disabled) return i;
      }
      return prev;
    });
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); open(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveHighlight(1); break;
      case 'ArrowUp': e.preventDefault(); moveHighlight(-1); break;
      case 'Enter': e.preventDefault(); if (norm[highlight]) choose(norm[highlight]); break;
      case ' ': e.preventDefault(); if (norm[highlight]) choose(norm[highlight]); break;
      case 'Escape': e.preventDefault(); setIsOpen(false); break;
      case 'Tab': setIsOpen(false); break;
      default: break;
    }
  };

  // Grow to fit the widest option (min = trigger width), but never past the
  // viewport edge. Anchored to the trigger's start edge per direction.
  const vw = pos.vw || (typeof window !== 'undefined' ? window.innerWidth : 9999);
  const panelStyle = {
    position: 'fixed',
    minWidth: pos.width,
    maxWidth: Math.max(pos.width, vw - (isRTL ? (pos.right || 0) : pos.left) - 8),
    maxHeight: pos.maxHeight,
    ...(pos.openUp ? { bottom: pos.bottom + 6 } : { top: pos.top + 6 }),
    ...(isRTL ? { right: pos.right } : { left: pos.left }),
    direction: isRTL ? 'rtl' : 'ltr',
  };

  return (
    <div
      className={`custom-select-container ${className} ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
      ref={containerRef}
      style={style}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
      >
        <span className={`select-display-value ${selected ? '' : 'is-placeholder'}`}>{displayValue}</span>
        <svg
          className={`select-chevron ${isOpen ? 'open' : ''}`}
          width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={panelRef}
              className="select-options"
              role="listbox"
              style={panelStyle}
              initial={{ opacity: 0, y: pos.openUp ? 8 : -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.openUp ? 8 : -8, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
              {norm.length === 0 && <div className="select-empty">—</div>}
              {norm.map((opt, idx) => {
                const isSel = opt.value === value;
                return (
                  <div
                    key={idx}
                    role="option"
                    aria-selected={isSel}
                    className={`select-option ${isSel ? 'selected' : ''} ${idx === highlight ? 'highlight' : ''} ${opt.disabled ? 'disabled' : ''}`}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => { e.preventDefault(); choose(opt); }}
                  >
                    <span className="select-option-label">{opt.label}</span>
                    {isSel && <Check size={14} className="select-option-check" />}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
