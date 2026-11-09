import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import NotesPage from '../../src/components/NotesPage';
import catalog from '../../src/catalog.json';
import { renderWithTheme } from './render';

// What the reader is told when a backup is taken in or refused (ADR 003). The notes page renders
// the whole source archive, which is slow on a busy machine.
vi.setConfig({ testTimeout: 30_000 });
const sync = { status: 'ready', message: '', pending: 0, hasToken: false, writeError: null, lastSentAt: null, lastSeenAt: null };
const upload = async (content, onRestore) => {
  const { container } = renderWithTheme(<NotesPage states={{}} personal={{ queue: [], reading: {} }} onRestore={onRestore} sync={sync}/>);
  const file = new File([typeof content === 'string' ? content : JSON.stringify(content)], 'yedek.json', { type: 'application/json' });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  return waitFor(() => screen.getByText(/içe aktarıldı|okunamadı|daha yeni|kişisel yedek değil/), { timeout: 15_000 });
};

describe('taking a backup in', () => {
  const id = catalog.books[0].id;

  it('restores a backup and says how much it took in', async () => {
    const onRestore = vi.fn();
    const input = { version: 3, states: { [id]: ['okundu'] }, queue: [id], reading: {} };
    expect((await upload(input, onRestore)).textContent).toBe('1 kitabın işaretleri ve 0 okuma kaydı içe aktarıldı. Okuma sırası 1 kitapla geri yüklendi.');
    expect(onRestore).toHaveBeenCalledWith({ [id]: ['okundu'] }, input);
  });

  it('refuses a backup from a newer version of the site and keeps the reader\'s records', async () => {
    const onRestore = vi.fn();
    expect((await upload({ version: 4, states: { [id]: ['okundu'] } }, onRestore)).textContent).toMatch(/daha yeni bir sürümünde/);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('tells the sync backup from a personal one', async () => {
    const onRestore = vi.fn();
    expect((await upload({ version: 1, copies: [] }, onRestore)).textContent).toMatch(/kişisel yedek değil/);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('says so when the file is not JSON', async () => {
    const onRestore = vi.fn();
    expect((await upload('bu json değil', onRestore)).textContent).toMatch(/Dosya okunamadı/);
    expect(onRestore).not.toHaveBeenCalled();
  });
});
