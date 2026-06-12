import React from 'react';
import ReactDOM from 'react-dom/client';
import '../src/renderer/styles/globals.css';
import { RealHarnessApp } from './RealHarnessApp';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('no root');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <RealHarnessApp />
  </React.StrictMode>,
);
