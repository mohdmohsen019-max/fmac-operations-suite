import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './CustomSelect.css';

export default function CustomSelect({ value, onChange, options, placeholder = "Select option", className = "", style = {} }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => 
    (typeof opt === 'object' ? opt.value : opt) === value
  );

  const displayValue = selectedOption 
    ? (typeof selectedOption === 'object' ? selectedOption.label : selectedOption)
    : placeholder;

  return (
    <div className={`custom-select-container ${className} ${isOpen ? 'is-open' : ''}`} ref={containerRef} style={style}>
      <button 
        className={`select-trigger ${isOpen ? 'open' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="select-display-value">{displayValue}</span>
        <svg 
          className={`select-chevron ${isOpen ? 'open' : ''}`} 
          style={{ width: '10px', height: '10px', minWidth: '10px', minHeight: '10px', flexShrink: 0, marginLeft: '8px' }}
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className="select-options"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {options.map((opt, idx) => {
              const val = typeof opt === 'object' ? opt.value : opt;
              const label = typeof opt === 'object' ? opt.label : opt;
              const isSelected = val === value;

              return (
                <div 
                  key={idx}
                  className={`select-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(val);
                    setIsOpen(false);
                  }}
                >
                  {label}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
