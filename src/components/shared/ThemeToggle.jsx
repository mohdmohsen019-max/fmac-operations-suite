import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import './ThemeToggle.css';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  return (
    <button
      className="theme-toggle-pill"
      onClick={toggleTheme}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
    >
      <span className={`theme-pill-option${!isLight ? ' active' : ''}`}>
        <Moon size={11} strokeWidth={2} />
      </span>
      <span className={`theme-pill-option${isLight ? ' active' : ''}`}>
        <Sun size={11} strokeWidth={2.5} />
      </span>
    </button>
  );
}
