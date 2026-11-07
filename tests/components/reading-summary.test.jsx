import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithTheme } from './render';
import ReadingSummary from '../../src/components/ReadingSummary';

// The catalogue's reading band (docs/UI-REDESIGN.md, phase 3): what the reader has read,
// is reading, owns, likes and has queued, each a way into that shelf.
const summary = { total: 1002, read: 120, reading: 3, owned: 17, favorites: 1, queued: 2, readShare: 120 / 1002 };

describe('ReadingSummary', () => {
  it('names the band and gives the read share of the catalogue in Turkish', () => {
    renderWithTheme(<ReadingSummary summary={summary} onSelect={() => {}} />);
    expect(screen.getByRole('region', { name: 'Okuma özetim' })).toBeTruthy();
    // The band comes before the page's h1, so its name is a label, not a heading (review, 8 November 2026).
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('%12')).toBeTruthy();
    expect(screen.getByText('1.002 kitaptan 120 tanesi okundu.')).toBeTruthy();
  });

  it('shows the share as a bar with square ends, never a ring (owner: no corner over 5 px)', () => {
    const { container } = renderWithTheme(<ReadingSummary summary={summary} onSelect={() => {}} />);
    const bar = screen.getByRole('progressbar', { name: 'Okunan oranı' });
    expect(bar.getAttribute('aria-valuenow')).toBe(String(Math.round(summary.readShare * 100)));
    expect(container.querySelector('circle')).toBeNull();
  });

  it('turns every count into a way to that shelf', () => {
    const onSelect = vi.fn();
    renderWithTheme(<ReadingSummary summary={summary} onSelect={onSelect} />);
    const shelves = [['Okunan: 120 kitap', 'read'], ['Okuyorum: 3 kitap', 'reading'], ['Sıramda: 2 kitap', 'queued'], ['Kitaplığım: 17 kitap', 'owned'], ['Favoriler: 1 kitap', 'favorites']];
    for (const [name, key] of shelves) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(onSelect).toHaveBeenLastCalledWith(key);
    }
    expect(onSelect).toHaveBeenCalledTimes(shelves.length);
  });

  it('says plainly when nothing is read yet, and keeps a small share above zero', () => {
    renderWithTheme(<ReadingSummary summary={{ ...summary, read: 0, readShare: 0 }} onSelect={() => {}} />);
    expect(screen.getByText('%0')).toBeTruthy();
    expect(screen.getByText('Henüz okundu işaretli kitap yok.')).toBeTruthy();
  });

  it('gives a share under one percent with one decimal, so a read book never shows as %0', () => {
    renderWithTheme(<ReadingSummary summary={{ ...summary, read: 3, readShare: 3 / 1002 }} onSelect={() => {}} />);
    expect(screen.getByText('%0,3')).toBeTruthy();
  });
});
