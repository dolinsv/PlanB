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

/** Resolved light/dark used for CSS (data-theme) and VKUI appearance. */
export function resolveAppearance(theme) {
  if (theme === 'dark' || theme === 'light') return theme;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
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
