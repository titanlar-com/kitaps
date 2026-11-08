import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from './render';
import ReadingJourney from '../../src/components/ReadingJourney';

describe('ReadingJourney', () => {
  it('shows how far the reader is, in pages and as a bar', () => {
    renderWithTheme(<ReadingJourney record={{ page: 75, totalPages: 300 }} />);
    expect(screen.getByText('75 / 300 sayfa')).toBeTruthy();
    expect(screen.getByText('%25')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Okunan sayfa oranı' }).getAttribute('aria-valuenow')).toBe('25');
  });

  it('lists the reading history in date order with Turkish days', () => {
    const { container } = renderWithTheme(<ReadingJourney record={{ startedAt: '2026-01-02', finishedAt: '2026-02-03' }} />);
    const text = container.textContent;
    expect(text.indexOf('Başladım')).toBeLessThan(text.indexOf('Bitirdim'));
    expect(text).toContain('2 Ocak 2026');
    expect(text).toContain('3 Şubat 2026');
  });

  it('shows nothing when there is nothing to show', () => {
    const { container } = renderWithTheme(<ReadingJourney record={{ why: 'Merak ettim.' }} />);
    expect(container.querySelector('.reading-journey')).toBeNull();
  });
});
