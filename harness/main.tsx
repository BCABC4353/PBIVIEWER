import React from 'react';
import ReactDOM from 'react-dom/client';
import { HarnessApp } from './HarnessApp';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('no root');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <HarnessApp />
  </React.StrictMode>,
);
