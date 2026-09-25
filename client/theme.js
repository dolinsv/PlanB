import { createContext, useContext } from 'react';

export const THEME_KEY = 'planb_theme';
export const THEME_ORDER = ['dark', 'light'];

export function readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'dark' || v === 'light') return v;
    // Old "auto" (or missing) → prefer system once, then store explicit choice
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
  } catch {
    /* private mode */
  }
  return 'light';
}

/** Always light or dark — no system follow. */
export function resolveAppearance(theme) {
  return theme === 'dark' ? 'dark' : 'light';
}

export function applyThemeToDom(theme) {
  if (typeof document === 'undefined') return;
  const appearance = resolveAppearance(theme);
  const root = document.documentElement;
  root.setAttribute('data-theme', appearance);
  root.style.colorScheme = appearance;
  root.classList.toggle('cp-theme-dark', appearance === 'dark');
  root.classList.toggle('cp-theme-light', appearance === 'light');
  const meta = document.getElementById('cp-theme-color');
  if (meta) {
    meta.setAttribute('content', appearance === 'dark' ? '#1c1f23' : '#0e7490');
  }
}

export const ThemeContext = createContext({
  theme: 'auto',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
