import React from 'react';
import ReactDOM from 'react-dom/client';
import { MorphDemo } from '../src/renderer/lib/morph/demo/MorphDemo';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('no root');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <MorphDemo />
  </React.StrictMode>,
);
