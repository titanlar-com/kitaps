import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { trackFocusMode } from './focusMode';

trackFocusMode();
createRoot(document.getElementById('root')).render(<App/>);
