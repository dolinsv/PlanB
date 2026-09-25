import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ConfigProvider,
  AdaptivityProvider,
  AppRoot,
} from '@vkontakte/vkui';
import '@vkontakte/vkui/dist/vkui.css';
import App from './App.jsx';
import { startVersionWatch } from './versionWatch.js';
import {
  THEME_KEY,
  ThemeContext,
  applyThemeToDom,
  readTheme,
  resolveAppearance,
} from './theme.js';

startVersionWatch();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch((e) => console.warn('SW registration failed', e));
}

function Root() {
  const [theme, setThemeState] = useState(readTheme);
  const appearance = resolveAppearance(theme);

  useEffect(() => {
    applyThemeToDom(theme);
    if (theme !== 'auto') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeToDom('auto');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const ctx = useMemo(
    () => ({
      theme,
      setTheme: (next) => {
        setThemeState(next);
        applyThemeToDom(next);
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          /* private mode */
        }
      },
    }),
    [theme]
  );

  return (
    <ThemeContext.Provider value={ctx}>
      <ConfigProvider locale="ru" appearance={appearance}>
        <AdaptivityProvider>
          <AppRoot>
            <App />
          </AppRoot>
        </AdaptivityProvider>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

applyThemeToDom(readTheme());
createRoot(document.getElementById('root')).render(<Root />);
