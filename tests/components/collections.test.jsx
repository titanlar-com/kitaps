import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import catalog from '../../src/catalog.json';
import { renderWithTheme } from './render';
import { Collections } from '../../src/ui/react/app/Collections';
import EmptyState from '../../src/ui/react/components/EmptyState';
import ShelfEmpty from '../../src/ui/react/components/ShelfEmpty';

// Kümeler (docs/UI-REDESIGN.md, phase 5): each collection with its covers and how much of it
// is read, and the empty states that always offer a next step.
const time = catalog.collections.find(item => item.id === 'time');
const timeBooks = catalog.books.filter(book => book.collectionIds.includes('time'));
// Searching 36 open-ended cards by role is slow in jsdom, so a card is found by its control's text.
const cardOf = title => [...document.querySelectorAll('.collection-card')].find(card => card.querySelector('.mantine-Accordion-control').textContent.includes(title));
const render = (props = {}) => renderWithTheme(<Collections onCollection={() => {}} onGroup={() => {}} states={{}} {...props} />);

vi.setConfig({ testTimeout: 30_000 });

describe('Collections', () => {
  it('shows one card for every collection, each with a heading', () => {
    const { container } = render();
    expect(container.querySelectorAll('.collection-card').length).toBe(catalog.collections.length);
    expect(container.querySelectorAll('.collection-card h2').length).toBe(catalog.collections.length);
  });

  it('writes how much of a collection is read, as a sentence, a share and a bar', () => {
    const states = Object.fromEntries(timeBooks.slice(0, 5).map(book => [book.id, ['okundu']]));
    render({ states });
    const card = cardOf(time.title);
    expect(within(card).getByText(`${timeBooks.length} kitaptan 5 tanesi okundu.`)).toBeTruthy();
    expect(within(card).getByText('%20')).toBeTruthy();
    const bar = within(card).getByRole('progressbar', { name: `${time.title}: okunan oranı` });
    expect(bar.getAttribute('aria-valuenow')).toBe('20');
  });

  // The sentence is about the original list (ADR 003, K12 item 4): 99 records became 100 books here.
  it('gives the source list its own count, and says nothing when that count is not known', () => {
    render();
    const pmba = catalog.collections.find(item => item.id === 'pmba');
    expect(pmba.originalCount).not.toBe(pmba.count);
    expect(cardOf(pmba.title).textContent).toContain(`Kaynak listesinde ${pmba.originalCount} kayıt var.`);
    expect(cardOf(pmba.title).textContent).not.toContain(`Kaynak listesinde ${pmba.count} kayıt var.`);
    const unknown = catalog.collections.find(item => item.originalCount === undefined);
    expect(cardOf(unknown.title).textContent).not.toContain('Kaynak listesinde');
  });

  it('says so plainly when nothing, or everything, is read', () => {
    render({ states: Object.fromEntries(timeBooks.map(book => [book.id, ['okundu']])) });
    const done = cardOf(time.title);
    expect(within(done).getByText(`${timeBooks.length} kitabın tamamı okundu.`)).toBeTruthy();
    // A collection that shares no book with the one read above.
    const untouched = catalog.collections.find(item => !catalog.books.some(book => book.collectionIds.includes(item.id) && book.collectionIds.includes('time')));
    expect(within(cardOf(untouched.title)).getByText('Bu kümeden henüz okunan kitap yok.')).toBeTruthy();
  });

  it('previews at most four covers, the small files, hidden from the screen reader', () => {
    const { container } = render();
    const covers = container.querySelector('.collection-card .collection-covers');
    expect(covers.getAttribute('aria-hidden')).toBe('true');
    const images = covers.querySelectorAll('img');
    expect(images.length).toBeGreaterThan(0);
    expect(images.length).toBeLessThanOrEqual(4);
    expect(images[0].getAttribute('src')).toMatch(/^\.\/covers\/sm\//);
    expect(images[0].getAttribute('alt')).toBe('');
    expect(images[0].getAttribute('loading')).toBe('lazy');
  });

  it('opens the books of a collection from the card without opening its details', () => {
    const onCollection = vi.fn();
    render({ onCollection });
    const button = within(cardOf(time.title)).getByRole('button', { name: `Bu kümedeki kitaplar: ${time.title}` });
    fireEvent.click(button);
    expect(onCollection).toHaveBeenCalledWith('time');
  });

  it('keeps every part of a collection a way to its books', () => {
    const onGroup = vi.fn();
    render({ onGroup });
    const card = cardOf(time.title);
    fireEvent.click(card.querySelector('.subset-button'));
    expect(onGroup).toHaveBeenCalledWith('time', time.groupIds[0]);
  });

  it('finds collections by a search and says how many it found', () => {
    render();
    fireEvent.change(screen.getByLabelText('Kümeler arasında ara'), { target: { value: 'wilde' } });
    expect(document.querySelectorAll('.collection-card h2').length).toBe(2);
    expect(screen.getByRole('status').textContent).toBe('2 küme bulundu.');
  });

  it('turns a search that finds nothing into a next step', () => {
    const { container } = render();
    const field = screen.getByLabelText('Kümeler arasında ara');
    fireEvent.change(field, { target: { value: 'zzzz' } });
    expect(screen.getByRole('heading', { level: 2, name: 'Bu aramayla eşleşen küme yok.' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aramayı temizle' }));
    expect(field.value).toBe('');
    expect(container.querySelectorAll('.collection-card').length).toBe(catalog.collections.length);
  });

  it('draws no circle: the bars and previews have square ends', () => {
    const { container } = render();
    expect(container.querySelector('circle')).toBeNull();
  });

  it('writes its own lines without a semicolon or a long dash', () => {
    const { container } = render();
    const own = [...container.querySelectorAll('.collection-meta, .collection-read-text')].map(node => node.textContent).join(' ');
    expect(own).toBeTruthy();
    expect(own).not.toMatch(/[;—·]/);
  });
});

describe('EmptyState', () => {
  it('gives a heading, a sentence and the action', () => {
    renderWithTheme(<EmptyState title="Boş" action={<button>Devam</button>}>Burada henüz bir şey yok.</EmptyState>);
    expect(screen.getByRole('heading', { level: 2, name: 'Boş' })).toBeTruthy();
    expect(screen.getByText('Burada henüz bir şey yok.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Devam' })).toBeTruthy();
  });
});

describe('ShelfEmpty', () => {
  it('tells a reader with no favourites how to add one and sends them to the catalogue', () => {
    const onBrowse = vi.fn();
    renderWithTheme(<ShelfEmpty shelf="favorites" onBrowse={onBrowse} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Henüz favori kitap yok.' })).toBeTruthy();
    expect(screen.getByText('Bir kitabın kartındaki kalp düğmesine bastığında kitap burada görünür.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kataloğa git' }));
    expect(onBrowse).toHaveBeenCalledOnce();
  });

  it('tells a reader with an empty library what puts a book there, reading marks too', () => {
    renderWithTheme(<ShelfEmpty shelf="owned" onBrowse={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Kitaplığın ilk kitabını bekliyor.' })).toBeTruthy();
    expect(screen.getByText('Bir kitabın kartında “Satın aldım” düğmesine bastığında kitap burada görünür. Okumaya başladığın kitaplar da buraya gelir.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kataloğa git' })).toBeTruthy();
  });
});
