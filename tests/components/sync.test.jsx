import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import GitHubSyncPanel from '../../src/components/GitHubSyncPanel';
import SyncMergeDialog from '../../src/components/SyncMergeDialog';
import SyncNotice from '../../src/components/SyncNotice';
import { renderWithTheme } from './render';

const sync = overrides => ({ status: 'ready', message: 'GitHub durumu güncel.', pending: 0, hasToken: false, saveToken: vi.fn(async () => {}), flush: vi.fn(async () => {}), load: vi.fn(), clearToken: vi.fn(), mergePrompt: null, resolveMerge: vi.fn(async () => {}), ...overrides });

describe('GitHubSyncPanel', () => {
  it('guides the reader to a fine-grained token limited to the state repository', () => {
    renderWithTheme(<GitHubSyncPanel sync={sync()}/>);
    const link = screen.getByRole('link', { name: /hazır ayarlarla oluştur/ });
    const url = new URL(link.getAttribute('href'));
    expect(url.origin + url.pathname).toBe('https://github.com/settings/personal-access-tokens/new');
    expect(url.searchParams.get('target_name')).toBe('titanlar-com');
    expect(url.searchParams.get('description')).toContain('titanlar-com/kitaps-state');
    // A token owned by a personal account cannot reach the organisation's repository.
    expect(screen.getByText(/Resource owner olarak titanlar-com seçili kalsın/)).toBeTruthy();
    expect(screen.getByText(/titanlar-com\.github\.io altındaki diğer sayfalar/)).toBeTruthy();
    expect(url.searchParams.get('contents')).toBe('write');
    expect(Number(url.searchParams.get('expires_in'))).toBeLessThanOrEqual(90);
    expect(screen.getByText(/Only select repositories/)).toBeTruthy();
    expect(screen.getByText(/Klasik ve OAuth anahtarları kabul edilmez/)).toBeTruthy();
    expect(screen.getByText(/aynı tarayıcı alanını paylaştığı/)).toBeTruthy();
  });

  it('sends the entered token to validation and clears the field', async () => {
    const value = sync();
    renderWithTheme(<GitHubSyncPanel sync={value}/>);
    const input = screen.getByLabelText(/İnce ayarlı \(fine-grained\) GitHub anahtarı/);
    fireEvent.change(input, { target: { value: 'github_pat_TEST_ONLY_not_a_real_token_for_unit_tests' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bu cihazda bağla' }));
    await vi.waitFor(() => expect(value.saveToken).toHaveBeenCalledWith('github_pat_TEST_ONLY_not_a_real_token_for_unit_tests'));
    await vi.waitFor(() => expect(input.value).toBe(''));
  });

  it('drops its own frame and heading inside a dialog that carries the title', () => {
    renderWithTheme(<GitHubSyncPanel sync={sync()} framed={false}/>);
    expect(screen.queryByRole('heading', { name: 'Cihazlar arası eşitleme' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bu cihazda bağla' })).toBeTruthy();
  });

  it('offers flush, reload and removal once connected', () => {
    renderWithTheme(<GitHubSyncPanel sync={sync({ hasToken: true })}/>);
    expect(screen.getByRole('button', { name: 'Şimdi gönder' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Anahtarı kaldır' })).toBeTruthy();
    expect(screen.queryByLabelText(/GitHub anahtarı/)).toBeNull();
  });
});

describe('SyncMergeDialog', () => {
  it('stays hidden without a decision to make', () => {
    renderWithTheme(<SyncMergeDialog sync={sync()}/>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('explains a connect-time difference in its own words', async () => {
    renderWithTheme(<SyncMergeDialog sync={sync({ mergePrompt: { conflicts: ['a'], queueConflict: false, reason: 'connect' } })}/>);
    expect(await screen.findByText(/Bu cihaz bağlı değilken 1 kitabın kaydı değişti; bu arada başka bir cihaz/)).toBeTruthy();
    expect(screen.queryByText(/ortak kayda eklendi/)).toBeNull();
  });

  it('lets the reader keep either side and passes the choice on', async () => {
    const value = sync({ mergePrompt: { conflicts: ['a', 'b'], queueConflict: true } });
    renderWithTheme(<SyncMergeDialog sync={value}/>);
    expect(await screen.findByText(/2 kitabın kaydı ve okuma sıran/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'GitHub’dakini kullan' }));
    await vi.waitFor(() => expect(value.resolveMerge).toHaveBeenCalledWith('shared'));
  });
});

describe('SyncNotice', () => {
  beforeEach(() => sessionStorage.clear());
  const TITLE = 'Bu cihazdaki işaretler yalnız burada';
  // The live region repeats the title, so the notice's own title is read from the notice.
  const noticeTitle = () => document.querySelector('.sync-notice .mantine-Alert-title')?.textContent;

  it('stays silent while changes can reach the other devices', () => {
    // A failed read is not a failed write: a connected device that could not read says nothing here.
    for (const value of [sync(), sync({ hasToken: true, pending: 2, status: 'queued' }), sync({ hasToken: true, status: 'error', pending: 0, writeError: 'Reddedildi.' }), sync({ hasToken: true, status: 'error', pending: 2, writeError: null })]) {
      const { container, unmount } = renderWithTheme(<SyncNotice sync={value} onOpen={vi.fn()}/>);
      expect(container.querySelector('.sync-notice')).toBeNull();
      unmount();
    }
  });

  it('tells a device that is not connected that its marks stay on it, and offers to connect', () => {
    const onOpen = vi.fn();
    renderWithTheme(<SyncNotice sync={sync({ pending: 3, status: 'queued' })} onOpen={onOpen}/>);
    expect(noticeTitle()).toBe(TITLE);
    expect(screen.getByText(/3 değişiklik bu cihazda bekliyor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bu cihazı bağla' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('reports a refused write on a connected device', () => {
    renderWithTheme(<SyncNotice sync={sync({ hasToken: true, status: 'queued', pending: 1, message: 'Değişiklikler cihazda.', writeError: 'GitHub anahtarı reddetti.' })} onOpen={vi.fn()}/>);
    expect(noticeTitle()).toBe('Değişiklikler GitHub’a gönderilemedi');
    expect(screen.getByText(/GitHub anahtarı reddetti\. 1 değişiklik bu cihazda bekliyor/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eşitleme ayrıntıları' })).toBeTruthy();
  });

  it('hides for the visit when dismissed, moves focus to the main content, and comes back when more changes wait', () => {
    const view = value => <MantineProvider><main id="main-content" tabIndex={-1}><SyncNotice sync={value} onOpen={vi.fn()}/></main></MantineProvider>;
    const { rerender } = render(view(sync({ pending: 1 })));
    screen.getByRole('button', { name: 'Şimdilik gizle' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Şimdilik gizle' }));
    expect(noticeTitle()).toBeUndefined();
    expect(document.activeElement.id).toBe('main-content');
    rerender(view(sync({ pending: 1 })));
    expect(noticeTitle()).toBeUndefined();
    rerender(view(sync({ pending: 2 })));
    expect(noticeTitle()).toBe(TITLE);
  });

  it('forgets a dismissal once the problem clears, so a new one is shown', () => {
    const view = value => <MantineProvider><SyncNotice sync={value} onOpen={vi.fn()}/></MantineProvider>;
    const failed = { hasToken: true, status: 'error', writeError: 'Reddedildi.' };
    const { rerender } = render(view(sync({ ...failed, pending: 3 })));
    fireEvent.click(screen.getByRole('button', { name: 'Şimdilik gizle' }));
    rerender(view(sync({ hasToken: true, pending: 0 })));
    rerender(view(sync({ ...failed, pending: 1 })));
    expect(noticeTitle()).toBe('Değişiklikler GitHub’a gönderilemedi');
  });

  it('announces itself through a live region that is always there, not through the notice', () => {
    const view = value => <MantineProvider><SyncNotice sync={value} onOpen={vi.fn()}/></MantineProvider>;
    const { rerender, container } = render(view(sync()));
    const live = screen.getByRole('status');
    expect(live.textContent).toBe('');
    rerender(view(sync({ pending: 1 })));
    expect(screen.getByRole('status')).toBe(live);
    expect(live.textContent).toBe(TITLE);
    expect(container.querySelector('.sync-notice').getAttribute('role')).toBe('note');
  });
});
