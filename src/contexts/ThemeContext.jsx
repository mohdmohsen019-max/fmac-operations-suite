import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // One-time migration to the Meadow (v2) design: default to light.
    // index.html runs the same migration pre-paint; this covers HMR/edge cases.
    if (!localStorage.getItem('fmac-theme-v2')) {
      localStorage.setItem('fmac-theme', 'light');
      localStorage.setItem('fmac-theme-v2', '1');
    }
    return localStorage.getItem('fmac-theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fmac-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(p => p === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);
