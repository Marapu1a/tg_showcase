import { requestJson } from './api/client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import './styles.css';

// Consume launch routing once, before React mounts. The parameter is only a
// public offer locator; it is never used as authentication or seller authority.
const launch =
  window.Telegram?.WebApp?.initDataUnsafe?.start_param ??
  new URLSearchParams(window.location.search).get('tgWebAppStartParam');
const target = launch?.match(/^(buy|detail|offer)_([a-zA-Z0-9-]{1,100})$/);
if (target && window.location.pathname === '/') {
  window.history.replaceState(null, '', `/offers/${target[2]}`);
  if (target[1] !== 'offer') {
    void requestJson(
      `/click/${target[1]}/${target[2]}`,
      { method: 'POST' },
      false,
    ).catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
