import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import GitHubSyncPanel from '../../src/components/GitHubSyncPanel';
import SyncStatusLine, { syncStatusKind } from '../../src/components/SyncStatusLine';
import { renderWithTheme } from './render';

const sync = overrides => ({ status: 'ready', message: 'GitHub durumu güncel.', pending: 0, hasToken: false, writeError: null, lastSentAt: null, lastReadAt: null, readSource: null, tokenRejected: false, saveToken: vi.fn(async () => {}), flush: vi.fn(async () => {}), load: vi.fn(), clearToken: vi.fn(), ...overrides });

describe('SyncStatusLine', () => {
  it('says beside the mark buttons that marks stay on a device that is not connected, and opens the connection', () => {
    const onOpen = vi.fn();
    renderWithTheme(<SyncStatusLine sync={sync({ pending: 1 })} onOpen={onOpen}/>);
    expect(screen.getByRole('status').textContent).toMatch(/1 değişiklik yalnız bu cihazda kayıtlı/);
    fireEvent.click(screen.getByRole('button', { name: 'Bu cihazı bağla' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('names each state of a connected device and never claims a send that did not happen', () => {
    expect(syncStatusKind(sync({ hasToken: true, pending: 2 }))).toBe('queued');
    expect(syncStatusKind(sync({ hasToken: true, pending: 2, status: 'saving' }))).toBe('saving');
    expect(syncStatusKind(sync({ hasToken: true, pending: 2, writeError: 'GitHub anahtarı reddetti.' }))).toBe('failed');
    expect(syncStatusKind(sync({ hasToken: true, tokenRejected: true, writeError: 'GitHub anahtarı reddetti.' }))).toBe('failed');
    expect(syncStatusKind(sync({ hasToken: true }))).toBe(null);
    expect(syncStatusKind(sync({ hasToken: true, lastSentAt: Date.parse('2026-10-21T18:05:00Z') }))).toBe('sent');
    // A device that only reads says nothing until it has a change of its own.
    expect(syncStatusKind(sync())).toBe(null);
  });

  it('keeps an empty, text-only live region so the first change is announced, with the button outside it', () => {
    const { container, rerender } = renderWithTheme(<SyncStatusLine sync={sync()} onOpen={vi.fn()}/>);
    const region = container.querySelector('.sync-status-text');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.textContent).toBe('');
    rerender(<MantineProvider><SyncStatusLine sync={sync({ pending: 1 })} onOpen={vi.fn()}/></MantineProvider>);
    expect(region.textContent).toMatch(/yalnız bu cihazda/);
    expect(region.querySelector('button')).toBeNull();
    expect(container.querySelector('.sync-status-line button')).toBeTruthy();
  });

  it('words a refused key, a pending comparison and GitHub’s wait as what they are', () => {
    const text = value => { const { container, unmount } = renderWithTheme(<SyncStatusLine sync={sync(value)} onOpen={vi.fn()}/>); const content = container.querySelector('.sync-status-text').textContent; unmount(); return content; };
    expect(text({ hasToken: true, tokenRejected: true, writeError: 'x' })).toMatch(/anahtarını reddetti; bu cihazı yeniden bağla/);
    expect(text({ hasToken: true, tokenRejected: true, writeError: 'x' })).not.toMatch(/0 değişiklik/);
    expect(text({ hasToken: true, pending: 1, reviewPending: true })).toMatch(/karşılaştırıldıktan sonra gönderilecek/);
    expect(text({ hasToken: true, pending: 1, retryAt: Date.parse('2026-10-22T09:30:00Z') })).toMatch(/GitHub’ın istediği bekleme bitince/);
  });
});

describe('GitHubSyncPanel without a key', () => {
  it('can still read the shared file again and says when a copy may lag', () => {
    const value = sync({ lastReadAt: Date.parse('2026-10-21T18:05:00Z'), readSource: 'cdn' });
    renderWithTheme(<GitHubSyncPanel sync={value}/>);
    fireEvent.click(screen.getByRole('button', { name: 'GitHub’dan yenile' }));
    expect(value.load).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/GitHub önbelleği, en çok beş dakika gecikebilir/)).toBeTruthy();
  });
});
