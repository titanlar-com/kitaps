import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { renderWithTheme } from './render';
import { emptyFilters } from '../../src/library';
import { ActiveFilters } from '../../src/ui/react/app/ActiveFilters';
import { BookCover } from '../../src/ui/react/app/BookCover';
import BackToTop from '../../src/ui/react/components/BackToTop';
import CommandPalette from '../../src/ui/react/components/CommandPalette';

vi.setConfig({ testTimeout: 20_000 });

describe('active filters', () => {
  it('are checked chips, and unchecking one removes that filter', () => {
    const onChange = vi.fn();
    renderWithTheme(<ActiveFilters filters={{ ...emptyFilters(), states: ['okundu'] }} onChange={onChange} />);
    const chip = screen.getByRole('checkbox', { name: 'Okundu' });
    expect(chip.checked).toBe(true);
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ states: [] }));
  });
});

describe('the cover frame', () => {
  it('is a Mantine AspectRatio at 2:3', () => {
    const { container } = renderWithTheme(<BookCover book={{ id: 'a', title: 'A', author: 'B' }} onOpen={() => {}} />);
    const frame = container.querySelector('.mantine-AspectRatio-root');
    expect(frame).toBeTruthy();
    expect(frame.style.getPropertyValue('--ar-ratio')).toBe(String(2 / 3));
    expect(frame.querySelector('.cover-stage')).toBeTruthy();
  });
});

describe('back to top', () => {
  const scrollTo = (y) => { Object.defineProperty(window, 'scrollY', { value: y, configurable: true }); Object.defineProperty(window, 'pageYOffset', { value: y, configurable: true }); act(() => window.dispatchEvent(new Event('scroll'))); };
  it('appears only once the page has been scrolled, and goes back to the top', async () => {
    window.scrollTo = vi.fn();
    renderWithTheme(<><main id="main-content" tabIndex={-1} /><BackToTop label="Başa dön" /></>);
    expect(screen.queryByRole('button', { name: 'Başa dön' })).toBeNull();
    scrollTo(2000);
    const button = await screen.findByRole('button', { name: 'Başa dön' });
    fireEvent.click(button);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    await waitFor(() => expect(document.activeElement?.id).toBe('main-content'));
    scrollTo(0);
  });
});

describe('the command palette', () => {
  const books = [{ id: 'dune', title: 'Dune', titleTr: 'Dune', author: 'Frank Herbert', searchText: 'dune frank herbert' }];
  const views = [{ id: 'queue', label: 'Sıram' }];
  it('opens on request, finds a book and hands it over', async () => {
    const onBook = vi.fn();
    renderWithTheme(<CommandPalette request={1} books={books} views={views} onBook={onBook} onPage={() => {}} />);
    expect(await screen.findByRole('dialog', { name: 'Kitap ya da bölüm ara' })).toBeTruthy();
    const input = await screen.findByRole('textbox', { name: 'Kitap ya da bölüm ara' });
    fireEvent.change(input, { target: { value: 'herbert' } });
    fireEvent.click(await screen.findByRole('button', { name: /Dune/ }));
    expect(onBook).toHaveBeenCalledWith('dune');
  });
  it('asks for focus back only when the reader left without choosing', async () => {
    const onDismiss = vi.fn();
    renderWithTheme(<CommandPalette request={1} books={books} views={views} onBook={() => {}} onPage={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(await screen.findByRole('button', { name: /Sıram/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onDismiss).not.toHaveBeenCalled();
  });
  it('opens a section', async () => {
    const onPage = vi.fn();
    renderWithTheme(<CommandPalette request={1} books={books} views={views} onBook={() => {}} onPage={onPage} />);
    fireEvent.click(await screen.findByRole('button', { name: /Sıram/ }));
    expect(onPage).toHaveBeenCalledWith('queue');
  });
  it('stays closed when the reader moved on before it arrived, and opens on the next request', async () => {
    const wanted = vi.fn(() => false);
    const { rerender } = renderWithTheme(<CommandPalette request={1} books={books} views={views} onBook={() => {}} onPage={() => {}} wanted={wanted} />);
    await waitFor(() => expect(wanted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    wanted.mockReturnValue(true);
    rerender(<MantineProvider><CommandPalette request={2} books={books} views={views} onBook={() => {}} onPage={() => {}} wanted={wanted} /></MantineProvider>);
    expect(await screen.findByRole('dialog', { name: 'Kitap ya da bölüm ara' })).toBeTruthy();
  });
});
