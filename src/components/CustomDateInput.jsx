import { useRef } from 'react';
import './CustomDateInput.css';

/**
 * A stylish custom date input component.
 * @param {Object} props
 * @param {string} props.value - Current date value (YYYY-MM-DD)
 * @param {Function} props.onChange - Change handler
 * @param {string} props.label - Label text
 * @param {string} props.max - Max date string
 * @param {string} props.className - Additional class names
 */
export default function CustomDateInput({ value, onChange, label, max, className = "" }) {
  const inputRef = useRef(null);

  const formatDate = (dateStr) => {
    if (!dateStr) return "Select Date";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const handleClick = () => {
    if (inputRef.current) {
      if (typeof inputRef.current.showPicker === 'function') {
        inputRef.current.showPicker();
      } else {
        inputRef.current.focus();
        inputRef.current.click();
      }
    }
  };

  return (
    <div className={`custom-date-container ${className}`} onClick={handleClick}>
      {label && <label className="custom-date-label">{label}</label>}
      <div className="custom-date-trigger">
        <div className="custom-date-content">
          <svg className="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span className="date-text">{formatDate(value)}</span>
        </div>
        <input
          ref={inputRef}
          type="date"
          value={value}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="hidden-native-picker"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
