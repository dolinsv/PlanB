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

createRoot(document.getElementById('root')).render(
  <ConfigProvider>
    <AdaptivityProvider>
      <AppRoot>
        <App />
      </AppRoot>
    </AdaptivityProvider>
  </ConfigProvider>
);
