import { createContext, useContext } from 'react';

export const THEME_KEY = 'planb_theme';
export const THEME_ORDER = ['auto', 'dark', 'light'];

export function readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEME_ORDER.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export const ThemeContext = createContext({
  theme: 'auto',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
