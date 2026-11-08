import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithTheme } from './render';
import ReadingQueue from '../../src/components/ReadingQueue';
import { moveInQueue } from '../../src/reading';

// Sıram (docs/UI-REDESIGN.md, phase 5): the reader's order, its move buttons, and where the
// keyboard stays while the rows change places.
const books = Object.fromEntries([['a', 'Birinci Kitap'], ['b', 'İkinci Kitap'], ['c', 'Üçüncü Kitap']].map(([id, title]) => [id, { id, title, author: `${title} Yazarı` }]));
const Cover = ({ book }) => <span data-testid="cover">{book.id}</span>;

function Queue({ start = ['a', 'b', 'c'], reading = {}, states = {}, onBrowse = () => {}, onOpen = () => {} }) {
  const [queue, setQueue] = useState(start);
  return <ReadingQueue queue={queue} books={books} reading={reading} states={states} BookCover={Cover} onBrowse={onBrowse} onOpen={onOpen}
    onMove={(id, direction) => setQueue(current => moveInQueue(current, id, direction))}
    onRemove={id => setQueue(current => current.filter(value => value !== id))} />;
}
const up = title => screen.getByRole('button', { name: `${title}: sırada yukarı taşı` });
const down = title => screen.getByRole('button', { name: `${title}: sırada aşağı taşı` });
const remove = title => screen.getByRole('button', { name: `${title}: sıradan çıkar` });
const order = () => within(screen.getByRole('list')).getAllByRole('listitem').map(item => within(item).getByTestId('cover').textContent);

describe('ReadingQueue', () => {
  it('shows the books as a numbered list in the reader\'s order', () => {
    renderWithTheme(<Queue />);
    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(order()).toEqual(['a', 'b', 'c']);
    for (const [index, title] of ['Birinci Kitap', 'İkinci Kitap', 'Üçüncü Kitap'].entries()) {
      const item = screen.getAllByRole('listitem')[index];
      expect(within(item).getByText(`${index + 1}. sırada`)).toBeTruthy();
      expect(within(item).getByRole('heading', { level: 2, name: title })).toBeTruthy();
    }
  });

  it('names the first book as the next one to read', () => {
    renderWithTheme(<Queue />);
    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first).getByText('Sıradaki kitabın')).toBeTruthy();
    expect(within(second).queryByText('Sıradaki kitabın')).toBeNull();
  });

  it('turns the ends of the list off: the first cannot go up, the last cannot go down', () => {
    renderWithTheme(<Queue />);
    expect(up('Birinci Kitap').disabled).toBe(true);
    expect(down('Birinci Kitap').disabled).toBe(false);
    expect(up('Üçüncü Kitap').disabled).toBe(false);
    expect(down('Üçüncü Kitap').disabled).toBe(true);
  });

  it('asks for a move in the right direction, and only for that book', () => {
    const onMove = vi.fn();
    renderWithTheme(<ReadingQueue queue={['a', 'b']} books={books} reading={{}} states={{}} BookCover={Cover} onBrowse={() => {}} onOpen={() => {}} onRemove={() => {}} onMove={onMove} />);
    fireEvent.click(down('Birinci Kitap'));
    expect(onMove).toHaveBeenLastCalledWith('a', 1);
    fireEvent.click(up('İkinci Kitap'));
    expect(onMove).toHaveBeenLastCalledWith('b', -1);
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('reorders at once, keeps the keyboard on the moved book, and says where it went', () => {
    renderWithTheme(<Queue />);
    down('Birinci Kitap').focus();
    fireEvent.click(down('Birinci Kitap'));
    expect(order()).toEqual(['b', 'a', 'c']);
    expect(document.activeElement).toBe(down('Birinci Kitap'));
    expect(screen.getByRole('status').textContent).toBe('Birinci Kitap 2. sıraya taşındı.');
  });

  it('moves the keyboard to the other arrow when the book reaches an end', () => {
    renderWithTheme(<Queue />);
    up('İkinci Kitap').focus();
    fireEvent.click(up('İkinci Kitap'));
    expect(order()).toEqual(['b', 'a', 'c']);
    expect(up('İkinci Kitap').disabled).toBe(true);
    expect(document.activeElement).toBe(down('İkinci Kitap'));
  });

  it('after a removal the keyboard goes on to the next book, or the last one', () => {
    renderWithTheme(<Queue />);
    remove('Birinci Kitap').focus();
    fireEvent.click(remove('Birinci Kitap'));
    expect(order()).toEqual(['b', 'c']);
    expect(document.activeElement).toBe(remove('İkinci Kitap'));
    expect(screen.getByRole('status').textContent).toBe('Birinci Kitap sıradan çıkarıldı.');
    remove('Üçüncü Kitap').focus();
    fireEvent.click(remove('Üçüncü Kitap'));
    expect(document.activeElement).toBe(remove('İkinci Kitap'));
  });

  it('after the last book leaves, the keyboard lands on the empty state\'s next step', () => {
    renderWithTheme(<Queue start={['a']} />);
    remove('Birinci Kitap').focus();
    fireEvent.click(remove('Birinci Kitap'));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kitap seç' }));
    expect(screen.getByRole('status').textContent).toBe('Birinci Kitap sıradan çıkarıldı.');
  });

  it('writes page progress as a sentence with a labelled bar, and leaves it out when unknown', () => {
    renderWithTheme(<Queue reading={{ a: { page: 25, totalPages: 100 } }} />);
    const [first, second] = screen.getAllByRole('listitem');
    expect(within(first).getByText('100 sayfadan 25 tanesi okundu.')).toBeTruthy();
    expect(within(first).getByText('%25')).toBeTruthy();
    const bar = within(first).getByRole('progressbar', { name: 'Birinci Kitap: okuma ilerlemesi' });
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(within(second).queryByRole('progressbar')).toBeNull();
  });

  it('shows a reading mark as a badge and a bought mark not at all', () => {
    renderWithTheme(<Queue states={{ a: ['okunuyor', 'alindi'] }} />);
    const [first] = screen.getAllByRole('listitem');
    expect(within(first).getByText('Okunuyor')).toBeTruthy();
    expect(within(first).queryByText('Satın alındı')).toBeNull();
  });

  it('says how much room is left and offers the next step', () => {
    const onBrowse = vi.fn();
    renderWithTheme(<Queue start={['a', 'b']} onBrowse={onBrowse} />);
    expect(screen.getByText('Sırada 2 kitap var. 3 kitaplık yerin kaldı.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sırama kitap seç' }));
    expect(onBrowse).toHaveBeenCalledOnce();
  });

  it('has a real empty state: a heading, a plain sentence and one next step', () => {
    const onBrowse = vi.fn();
    renderWithTheme(<Queue start={[]} onBrowse={onBrowse} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Bir sonraki kitabına yer aç.' })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kitap seç' }));
    expect(onBrowse).toHaveBeenCalledOnce();
  });

  it('uses no semicolon, long dash or middle dot in what it writes', () => {
    const { container } = renderWithTheme(<Queue reading={{ a: { page: 25, totalPages: 100 } }} />);
    expect(container.querySelector('.queue-desk').textContent).not.toMatch(/[;—·]/);
  });
});
