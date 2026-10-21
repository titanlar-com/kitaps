import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
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

  it('keeps an empty live region so the first change is announced', () => {
    const { container } = renderWithTheme(<SyncStatusLine sync={sync()} onOpen={vi.fn()}/>);
    const region = container.querySelector('.sync-status-line');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.textContent).toBe('');
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
