import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/react/App';
import { catalog, catalogIndex } from './ui/react/app/catalogData';
import { browserLocation, deviceStorage } from './adapters/browser/ports.js';
import { createKitaplik } from './core/app.ts';
import { decodeRoute, encodeRoute } from './library';
import { trackFocusMode } from './focusMode';

trackFocusMode();
// The composition root (ADR 003, K2): the one place that puts the core together for this page.
const kitaplik = createKitaplik({
 catalog: catalogIndex,
 location: browserLocation(),
 codec: { decode: location => decodeRoute(location, catalog), encode: route => encodeRoute(route, catalog) },
 storage: deviceStorage,
});
createRoot(document.getElementById('root')).render(<App kitaplik={kitaplik}/>);
