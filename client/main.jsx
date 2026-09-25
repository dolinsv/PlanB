import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ConfigProvider,
  AdaptivityProvider,
  AppRoot,
} from '@vkontakte/vkui';
import '@vkontakte/vkui/dist/vkui.css';
import App from './App.jsx';
import { startVersionWatch } from './versionWatch.js';

startVersionWatch();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch((e) => console.warn('SW registration failed', e));
}

createRoot(document.getElementById('root')).render(
  <ConfigProvider locale="ru">
    <AdaptivityProvider>
      <AppRoot>
        <App />
      </AppRoot>
    </AdaptivityProvider>
  </ConfigProvider>
);
