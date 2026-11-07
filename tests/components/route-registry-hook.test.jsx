import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { GitHubRouteRegistry, ROUTES_PENDING_KEY, putRoute } from '../../src/state/routeRegistry.ts';
import { GITHUB_STATE_TOKEN_KEY } from '../../src/state/types.ts';
import { useRouteRegistry } from '../../src/routes/useRouteRegistry.js';

// A route saved without a key, or while GitHub was out of reach, waits on the device. When the
// page opens again, or the browser comes back online, it is sent, and the planner says so.
// Deliberately not shaped like a real token so secret scanners stay quiet.
const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_for_unit_tests';
const route = (id, extra = {}) => ({ id, title: 'Beyoğlu', date: '2026-11-07', stops: ['minoa-pera'], note: '', done: false, ...extra });

/** routes.json on a stand-in GitHub. `down` makes every request fail like a dropped connection. */
function github() {
  const server = { file: null, puts: 0, down: false, limited: false };
  server.fetch = vi.fn(async (url, init = {}) => {
    if (server.down) throw new TypeError('Failed to fetch');
    if (server.limited) return new Response('{}', { status: 403, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Date.UTC(2026, 10, 7, 11, 5) / 1000) } });
    if (url.startsWith('https://raw.')) return server.file ? new Response(JSON.stringify(server.file)) : new Response('Not Found', { status: 404 });
    if (init.method === 'PUT') {
      server.puts += 1;
      server.file = JSON.parse(atob(JSON.parse(init.body).content));
      return new Response(JSON.stringify({ content: { sha: `sha-${server.puts}` } }));
    }
    if (!server.file) return new Response('Not Found', { status: 404 });
    return new Response(JSON.stringify({ sha: `sha-${server.puts}`, encoding: 'base64', content: btoa(JSON.stringify(server.file)) }));
  });
  return server;
}

/** Saves a route on this device with no key, as an earlier visit would have. */
async function waitingChange(server) {
  const earlier = new GitHubRouteRegistry({ storage: localStorage, fetch: server.fetch });
  const result = await earlier.update((doc, now) => putRoute(doc, route('beyoglu'), now));
  expect(result.saved).toBe(false);
  expect(localStorage.getItem(ROUTES_PENDING_KEY)).not.toBeNull();
}

// One registry per page, as RoutePlanner keeps it. A new one on every render would reload forever.
const render = server => {
  const registry = new GitHubRouteRegistry({ storage: localStorage, fetch: server.fetch });
  return renderHook(() => useRouteRegistry(registry));
};

describe('useRouteRegistry with changes waiting on the device', () => {
  beforeEach(() => localStorage.clear());

  it('sends a waiting change when the page opens with a key, and says so', async () => {
    const server = github();
    await waitingChange(server);
    localStorage.setItem(GITHUB_STATE_TOKEN_KEY, TOKEN);
    const { result } = render(server);
    await waitFor(() => expect(result.current.status?.kind).toBe('saved'));
    expect(result.current.status.text).toBe('Bu cihazda bekleyen 1 rota değişikliği GitHub’a kaydedildi.');
    expect(server.puts).toBe(1);
    expect(Object.keys(server.file.routes)).toEqual(['beyoglu']);
    expect(localStorage.getItem(ROUTES_PENDING_KEY)).toBeNull();
    expect(result.current.routes.map(item => item.id)).toEqual(['beyoglu']);
  });

  it('says how many changes wait when there is no key to send them with', async () => {
    const server = github();
    await waitingChange(server);
    const { result } = render(server);
    await waitFor(() => expect(result.current.status?.kind).toBe('local'));
    expect(result.current.status.text).toBe('Bu cihazda GitHub’a gönderilmemiş 1 rota değişikliği var. Göndermek için cihaz eşitlemesini bağla.');
    expect(server.puts).toBe(0);
    expect(result.current.routes.map(item => item.id)).toEqual(['beyoglu']);
  });

  it('sends the waiting change when the browser comes back online', async () => {
    const server = github();
    await waitingChange(server);
    localStorage.setItem(GITHUB_STATE_TOKEN_KEY, TOKEN);
    server.down = true;
    const { result } = render(server);
    await waitFor(() => expect(result.current.status?.kind).toBe('error'));
    server.down = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(result.current.status?.kind).toBe('saved'));
    expect(server.puts).toBe(1);
    expect(localStorage.getItem(ROUTES_PENDING_KEY)).toBeNull();
  });

  it('names the rate limit and the time GitHub gave, and keeps the change', async () => {
    const server = github();
    localStorage.setItem(GITHUB_STATE_TOKEN_KEY, TOKEN);
    const { result } = render(server);
    await waitFor(() => expect(server.fetch).toHaveBeenCalled());
    server.limited = true;
    await act(async () => { await result.current.save(route('kadikoy', { title: 'Kadıköy' })); });
    const time = new Date(Date.UTC(2026, 10, 7, 11, 5)).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    expect(result.current.status).toEqual({ kind: 'error', text: `Rota GitHub’a gönderilemedi, çünkü GitHub istek sınırına ulaşıldı. Değişiklik bu cihazda bekliyor. Saat ${time} sonrasındaki ilk kayıtta ya da sayfa yeniden açıldığında gönderilir.` });
    expect(result.current.routes.map(item => item.id)).toEqual(['kadikoy']);
    expect(localStorage.getItem(ROUTES_PENDING_KEY)).not.toBeNull();
  });
});
