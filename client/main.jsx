import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ConfigProvider,
  AdaptivityProvider,
  AppRoot,
} from '@vkontakte/vkui';
import '@vkontakte/vkui/dist/vkui.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <ConfigProvider>
    <AdaptivityProvider>
      <AppRoot>
        <App />
      </AppRoot>
    </AdaptivityProvider>
  </ConfigProvider>
);
