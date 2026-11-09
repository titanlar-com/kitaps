import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import FilterSheet from '../../src/ui/react/components/FilterSheet';
import FooterMenu from '../../src/ui/react/components/FooterMenu';
import GitHubSyncPanel from '../../src/ui/react/components/GitHubSyncPanel';
import LibraryToast from '../../src/ui/react/components/LibraryToast';
import SyncMergeDialog from '../../src/ui/react/components/SyncMergeDialog';
import SyncNotice from '../../src/ui/react/components/SyncNotice';
import SyncStatusLine from '../../src/ui/react/components/SyncStatusLine';
import { emptyFilters } from '../../src/library';
import { renderWithTheme } from './render';

// Phase 7 of docs/UI-REDESIGN.md: the panels. What is pinned here is how each panel is built and
// worded; the sync behaviour keeps its own suites (sync.test.jsx, sync-status.test.jsx).
const sync = overrides => ({ status: 'ready', message: 'GitHub durumu güncel.', pending: 0, hasToken: false, saveToken: vi.fn(async () => {}), flush: vi.fn(async () => {}), load: vi.fn(), clearToken: vi.fn(), mergePrompt: null, resolveMerge: vi.fn(async () => {}), ...overrides });
const steps = () => within(screen.getByRole('list', { name: 'Bu cihazı bağla' })).getAllByRole('listitem');
const current = () => steps().findIndex(step => step.getAttribute('aria-current') === 'step');
const TOKEN = 'github_pat_TEST_ONLY_not_a_real_token_for_unit_tests';
// The sheet returns to the top of its list with this; jsdom has no layout to scroll.
Element.prototype.scrollTo ??= function scrollTo() {};

describe('connecting a device', () => {
  it('lays the connection out as numbered steps, with nothing interactive nested in a button', () => {
    renderWithTheme(<GitHubSyncPanel sync={sync()}/>);
    expect(steps()).toHaveLength(4);
    expect(steps().map(step => step.querySelector('.mantine-Stepper-stepLabel').textContent)).toEqual(['Anahtarı oluştur', 'Sahibi seç', 'Depoyu seç', 'Anahtarı yapıştır']);
    expect(current()).toBe(0);
    // A step is a list item, not a button: its link stays a link and no step is a tab stop.
    expect(steps().every(step => step.tagName !== 'BUTTON')).toBe(true);
    expect(within(steps()[0]).getByRole('link', { name: /hazır ayarlarla oluştur/ })).toBeTruthy();
    expect(document.querySelector('.sync-steps button')).toBeNull();
  });

  it('marks only what really happened: the form opened, then a key typed', () => {
    renderWithTheme(<GitHubSyncPanel sync={sync()}/>);
    const link = within(steps()[0]).getByRole('link', { name: /hazır ayarlarla oluştur/ });
    // The form opens in another tab; jsdom has nowhere to send it.
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);
    expect(current()).toBe(1);
    expect(steps()[0].querySelector('[data-completed]')).not.toBeNull();
    const field = screen.getByLabelText(/İnce ayarlı \(fine-grained\) GitHub anahtarı/);
    fireEvent.change(field, { target: { value: TOKEN } });
    expect(current()).toBe(3);
    expect(steps().slice(0, 3).every(step => step.querySelector('[data-completed]'))).toBe(true);
    fireEvent.change(field, { target: { value: '' } });
    expect(current()).toBe(1);
  });

  it('keeps the key in a password field and out of the page text', () => {
    renderWithTheme(<GitHubSyncPanel sync={sync()}/>);
    const field = screen.getByLabelText(/İnce ayarlı \(fine-grained\) GitHub anahtarı/);
    expect(field.getAttribute('type')).toBe('password');
    fireEvent.change(field, { target: { value: TOKEN } });
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it('says the steps are busy while GitHub checks the key', async () => {
    let answer;
    const value = sync({ saveToken: vi.fn(() => new Promise(resolve => { answer = resolve; })) });
    renderWithTheme(<GitHubSyncPanel sync={value}/>);
    fireEvent.change(screen.getByLabelText(/İnce ayarlı \(fine-grained\) GitHub anahtarı/), { target: { value: TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Bu cihazda bağla' }));
    await waitFor(() => expect(screen.getByRole('list', { name: 'Bu cihazı bağla' }).getAttribute('aria-busy')).toBe('true'));
    answer();
    await waitFor(() => expect(screen.getByRole('list', { name: 'Bu cihazı bağla' }).getAttribute('aria-busy')).toBeNull());
  });

  it('shows no steps once this device is connected, and names the state in the status', () => {
    renderWithTheme(<GitHubSyncPanel sync={sync({ hasToken: true })}/>);
    expect(screen.queryByRole('list', { name: 'Bu cihazı bağla' })).toBeNull();
    expect(screen.getByRole('status').querySelector('.mantine-Alert-title').textContent).toBe('Yazma bağlı');
  });

  it('keeps one live status, whatever the state', () => {
    renderWithTheme(<GitHubSyncPanel sync={sync({ status: 'error', message: 'GitHub yanıt vermedi.', pending: 2 })}/>);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('GitHub yanıt vermedi.');
    expect(status.textContent).toContain('2 değişiklik gönderilmeyi bekliyor.');
    expect(status.getAttribute('data-tone')).toBe('danger');
  });

  it('says when the shared file was last read and written in full sentences', () => {
    const at = Date.parse('2026-10-21T18:05:00Z');
    renderWithTheme(<GitHubSyncPanel sync={sync({ lastReadAt: at, readSource: 'cdn', lastSentAt: at })}/>);
    const line = document.querySelector('.sync-activity').textContent;
    expect(line).toMatch(/^Son okuma saat \d\d:\d\d\. Kaynak GitHub önbelleği, en çok beş dakika gecikebilir\. Son gönderim saat \d\d:\d\d\.$/);
  });
});

describe('words of the panels', () => {
  const clean = text => expect(text, text).not.toMatch(/[;—–·]/);
  // Mantine puts a <style> into the provider; only what a reader sees is checked.
  const words = node => { const copy = node.cloneNode(true); copy.querySelectorAll('style').forEach(style => style.remove()); return copy.textContent; };
  const at = Date.parse('2026-10-21T18:05:00Z');

  it('the connect panel in every state has no semicolon, long dash or middle dot', () => {
    for (const value of [sync(), sync({ hasToken: true, pending: 2, lastReadAt: at, readSource: 'cdn', lastSentAt: at }), sync({ recovery: { copies: 1, kept: 1, stored: true }, recoveryCopies: () => [] }), sync({ recovery: { copies: 1, kept: 0, stored: false }, recoveryCopies: () => [] })]) {
      const { container, unmount } = renderWithTheme(<GitHubSyncPanel sync={value}/>);
      clean(words(container));
      unmount();
    }
  });

  it('the status line in every state has none either', () => {
    for (const value of [{ pending: 1 }, { hasToken: true, tokenRejected: true, writeError: 'x' }, { hasToken: true, pending: 1, writeError: 'x' }, { hasToken: true, pending: 1, status: 'saving' }, { hasToken: true, pending: 1 }, { hasToken: true, lastSentAt: at }]) {
      const { container, unmount } = renderWithTheme(<SyncStatusLine sync={sync(value)} onOpen={vi.fn()}/>);
      clean(container.querySelector('.sync-status-text').textContent);
      unmount();
    }
  });

  it('the notice for a damaged queue has none either', () => {
    for (const recovery of [{ copies: 1, kept: 1, stored: true }, { copies: 1, kept: 0, stored: false }]) {
      const { container, unmount } = renderWithTheme(<SyncNotice sync={sync({ recovery })} onOpen={vi.fn()}/>);
      clean(words(container));
      unmount();
    }
  });

  it('the merge question has none either', async () => {
    for (const reason of ['connect', 'first-sync']) {
      const { unmount } = renderWithTheme(<SyncMergeDialog sync={sync({ mergePrompt: { conflicts: ['a'], queueConflict: true, reason } })}/>);
      clean((await screen.findByRole('dialog')).textContent);
      unmount();
    }
  });
});

describe('states are told by tone tokens, not by Mantine\'s palette', () => {
  it('a notice and an alert carry a tone the stylesheet colours', () => {
    const { container } = renderWithTheme(<SyncNotice sync={sync({ pending: 1 })} onOpen={vi.fn()}/>);
    const notice = container.querySelector('.sync-notice');
    expect(notice.getAttribute('data-tone')).toBe('warning');
    expect(notice.getAttribute('style') ?? '').not.toMatch(/orange|red|yellow/);
  });

  it('the action that removes the key is drawn with the danger class', () => {
    renderWithTheme(<GitHubSyncPanel sync={sync({ hasToken: true })}/>);
    const remove = screen.getByRole('button', { name: 'Anahtarı kaldır' });
    expect(remove.className).toContain('sync-danger');
    expect(remove.getAttribute('style') ?? '').not.toMatch(/mantine-color-red/);
  });
});

describe('the library toast', () => {
  const book = { id: 'a', title: 'Meditations' };
  const toast = props => renderWithTheme(<LibraryToast book={book} owned onClose={vi.fn()} onUndo={vi.fn()} {...props}/>);

  it('is a Mantine notification that leaves the announcing to the live region around it', () => {
    toast();
    const root = document.querySelector('.library-toast');
    expect(root.classList.contains('mantine-Notification-root')).toBe(true);
    // A nested alert would be read out twice.
    expect(root.getAttribute('role')).not.toBe('alert');
    expect(root.querySelector('strong').textContent).toBe('Kitaplığa eklendi');
    expect(root.querySelector('.library-toast-message').textContent).toContain('Meditations');
  });

  it('keeps its two actions, each with its own name', () => {
    const onClose = vi.fn(), onUndo = vi.fn();
    toast({ onClose, onUndo });
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    const close = screen.getByRole('button', { name: 'Bildirimi kapat' });
    expect(close.classList.contains('library-toast-close')).toBe(true);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the footer menu', () => {
  const groups = onSelect => [
    { id: 'sections', title: 'Bölümler', items: [{ label: 'Kitaplar', current: true, onSelect }, { label: 'Sıram', onSelect }] },
    { id: 'tools', title: 'Araçlar', items: [{ label: 'Çeviri rehberi', onSelect }] },
  ];

  it('lists its items as NavLinks and marks the current one', async () => {
    const onSelect = vi.fn();
    renderWithTheme(<FooterMenu groups={groups(onSelect)} current="Kitaplar" meta={<p>Güncelleme</p>}/>);
    fireEvent.click(screen.getByRole('button', { name: /Menü/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Menü' });
    expect(sheet.querySelectorAll('.mantine-NavLink-root')).toHaveLength(3);
    const item = within(sheet).getByRole('button', { name: 'Kitaplar' });
    expect(item.classList.contains('mantine-NavLink-root')).toBe(true);
    expect(item.getAttribute('aria-current')).toBe('page');
    expect(within(sheet).getByRole('button', { name: 'Sıram' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sıram' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('sets the catalogue dates apart with a divider', async () => {
    renderWithTheme(<FooterMenu groups={groups(vi.fn())} current="Kitaplar" meta={<p>Güncelleme</p>}/>);
    fireEvent.click(screen.getByRole('button', { name: /Menü/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Menü' });
    expect(sheet.querySelector('.footer-menu-divider.mantine-Divider-root')).not.toBeNull();
  });
});

describe('the filter sheet', () => {
  const catalog = {
    categories: [{ id: 'felsefe', label: 'Felsefe' }, { id: 'tarih', label: 'Tarih' }, { id: 'bilim', label: 'Bilim' }],
    collections: [{ id: 'yonetim', short: 'Yönetim' }],
    groups: [{ id: 'temel', collectionId: 'yonetim', title: 'Temeller' }],
    books: [{ id: 'a', addedAt: '2026-10-01' }, { id: 'b', addedAt: '2026-10-01' }],
  };
  const sheet = value => renderWithTheme(<FilterSheet opened onClose={vi.fn()} value={{ ...emptyFilters(), ...value }} onChange={vi.fn()} onReset={vi.fn()} onApply={vi.fn()} count={12} catalog={catalog} authors={['Ada', 'Bora']}/>);
  const group = (nav, name) => within(nav).getByRole('group', { name });

  it('groups its headings', async () => {
    sheet({});
    const nav = await screen.findByRole('navigation', { name: 'Filtre başlıkları' });
    const names = within(nav).getAllByRole('group').map(item => item.querySelector('.filter-group-title').textContent);
    expect(names).toEqual(['Konu', 'Okuma kayıtlarım', 'Künye ve tarih']);
    expect(within(group(nav, 'Konu')).getAllByRole('button').map(button => button.querySelector('strong').textContent)).toEqual(['Kategoriler', 'Yazarlar', 'Kümeler']);
    expect(within(group(nav, 'Okuma kayıtlarım')).getAllByRole('button').map(button => button.querySelector('strong').textContent)).toEqual(['Okuma durumum']);
    expect(within(group(nav, 'Künye ve tarih')).getAllByRole('button').map(button => button.querySelector('strong').textContent)).toEqual(['Baskı ve kaynak', 'Yıl ve ödül', 'Eklenme tarihi']);
  });

  it('counts the choices of each heading, of each group and of the whole sheet', async () => {
    sheet({ categories: ['felsefe', 'tarih'], authors: ['Ada'], states: ['okundu'] });
    const nav = await screen.findByRole('navigation', { name: 'Filtre başlıkları' });
    const topic = group(nav, 'Konu');
    expect(topic.querySelector('.filter-group-count').textContent).toBe('3 seçim');
    const categories = within(topic).getByRole('button', { name: /^Kategoriler/ });
    expect(categories.querySelector('.filter-section-count').textContent).toBe('2');
    expect(categories.querySelector('.filter-section-count').classList.contains('mantine-Badge-root')).toBe(true);
    expect(categories.getAttribute('aria-label')).toBe('Kategoriler: Felsefe, Tarih. 2 seçim');
    // A group with nothing chosen says nothing.
    expect(group(nav, 'Künye ve tarih').querySelector('.filter-group-count')).toBeNull();
    expect(document.querySelector('.filter-result-selection').textContent).toBe('4 seçim');
  });

  it('counts inside a heading too: how many are chosen, or how many there are', async () => {
    sheet({ categories: ['tarih'] });
    fireEvent.click(await screen.findByRole('button', { name: /^Kategoriler/ }));
    await waitFor(() => expect(document.querySelector('.filter-fieldset')).not.toBeNull());
    expect(document.querySelector('.filter-fieldset legend').textContent).toBe('Kategoriler1 seçili');
    fireEvent.click(screen.getByRole('button', { name: 'Filtre başlıklarına dön' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Yazarlar/ }));
    await waitFor(() => expect(document.querySelector('.filter-fieldset legend').textContent).toBe('Yazar2 seçenek'));
  });

  it('has no semicolon or long dash in its own words, on any heading', async () => {
    sheet({ yearMin: 2000, yearMax: 1990 });
    const words = [];
    const read = () => words.push(document.querySelector('.mantine-Drawer-content').textContent);
    await screen.findByRole('navigation', { name: 'Filtre başlıkları' });
    read();
    for (const name of ['Baskı ve kaynak', 'Yıl ve ödül', 'Eklenme tarihi', 'Yazarlar']) {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));
      await waitFor(() => expect(document.querySelector('.filter-fieldset')).not.toBeNull());
      read();
      fireEvent.click(screen.getByRole('button', { name: 'Filtre başlıklarına dön' }));
      await screen.findByRole('navigation', { name: 'Filtre başlıkları' });
    }
    for (const text of words) expect(text, text).not.toMatch(/[;—–]/);
  });
});
