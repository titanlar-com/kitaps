import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { FactList, PlaceBadge, StopTimeline } from '../../src/ui/react/components/PlaceParts';
import BookFairsPage from '../../src/ui/react/components/BookFairsPage';
import RoutePlanner from '../../src/ui/react/components/RoutePlanner';
import { routeTimeline } from '../../src/core/places/stores.js';
import { renderWithTheme } from './render';

// The small parts of the bookstores, routes and fairs screens (docs/UI-REDESIGN.md, phase 6).
const stores = [
 { id: 'minoa', name: 'Minoa Pera', side: 'europe', district: 'Beyoğlu', area: 'Tepebaşı', address: 'Meşrutiyet Cad.', status: 'open', geo: { lat: 41, lng: 28 } },
 { id: 'homer', name: 'Homer Kitabevi', side: 'europe', district: 'Beyoğlu', area: 'Beyoğlu', address: 'Yeni Çarşı', status: 'open', geo: { lat: 41.1, lng: 28.1 } },
];
const byId = Object.fromEntries(stores.map(store => [store.id, store]));
const registry = () => ({ cached: () => ({ schemaVersion: 1, updatedAt: '', routes: {} }), load: async () => ({ schemaVersion: 1, updatedAt: '', routes: {} }), read: async () => ({ schemaVersion: 1, updatedAt: '', routes: {} }), pendingCount: () => 0, hasToken: () => false, update: async () => ({ document: { schemaVersion: 1, updatedAt: '', routes: {} }, saved: false }), flush: async () => ({ document: { schemaVersion: 1, updatedAt: '', routes: {} } }) });

describe('PlaceBadge', () => {
 it('says the state in words and hands its tone to the stylesheet', () => {
  renderWithTheme(<PlaceBadge badge={{ label: 'Kapandı', tone: 'muted', icon: 'closed' }} />);
  const badge = screen.getByText('Kapandı').closest('.mantine-Badge-root');
  expect(badge).toHaveProperty('dataset.tone', 'muted');
 });

 it('draws nothing when there is no badge', () => {
  const { container } = renderWithTheme(<PlaceBadge badge={null} />);
  expect(container.querySelector('.mantine-Badge-root')).toBeNull();
 });
});

describe('StopTimeline', () => {
 it('is an ordered list that keeps the stops in order', () => {
  const { container } = renderWithTheme(<StopTimeline stops={routeTimeline(['homer', 'minoa'], byId)}>{stop => stop.name}</StopTimeline>);
  const list = container.querySelector('ol');
  expect(list).not.toBeNull();
  expect([...list.children].map(item => item.tagName)).toEqual(['LI', 'LI']);
  expect([...list.children].map(item => item.textContent)).toEqual(['Homer Kitabevi', 'Minoa Pera']);
 });

 it('keeps its numbers out of the text: the stylesheet draws them and the list says them', () => {
  const { container } = renderWithTheme(<StopTimeline stops={routeTimeline(['minoa'], byId)}>{stop => stop.name}</StopTimeline>);
  expect(container.querySelector('.mantine-Timeline-itemBullet').textContent).toBe('');
 });
});

describe('FactList', () => {
 it('is a definition list that pairs each label with its value', () => {
  const { container } = renderWithTheme(<FactList facts={[{ label: 'Adres', value: 'Bir sokak' }, { label: 'Saat', value: '10.00' }]} />);
  expect(container.querySelector('dl')).not.toBeNull();
  expect([...container.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['Adres', 'Saat']);
  expect([...container.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['Bir sokak', '10.00']);
 });

 it('leaves out what it has no value for', () => {
  const { container } = renderWithTheme(<FactList facts={[{ label: 'Saat', value: null }]} />);
  expect(container.querySelector('dl')).toBeNull();
 });
});

describe('RoutePlanner', () => {
 const steps = container => [...container.querySelectorAll('.mantine-Stepper-step')];
 const current = container => steps(container).findIndex(step => step.getAttribute('aria-current') === 'step');

 it('shows three steps as a list, and none of them is a button', () => {
  const { container } = renderWithTheme(<RoutePlanner stores={stores} registry={registry()} />);
  const list = within(container).getByRole('list', { name: 'Rota hazırlama adımları' });
  expect(within(list).getAllByRole('listitem').map(item => item.textContent.replace(/\d/g, '').trim())).toEqual(['Seç', 'Sırala', 'Kaydet']);
  expect(steps(container).every(step => step.tagName !== 'BUTTON')).toBe(true);
  expect(current(container)).toBe(0);
 });

 it('moves to the last step only when the route has stops and a name', () => {
  const { container } = renderWithTheme(<RoutePlanner stores={stores} registry={registry()} />);
  fireEvent.change(screen.getByRole('textbox', { name: /Rota adı/ }), { target: { value: 'Deneme' } });
  expect(current(container)).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Sıradaki rotayı öner' }));
  expect(current(container)).toBe(2);
 });
});

describe('BookFairsPage', () => {
 it('draws one timeline item for each month, with the month as its heading', () => {
  const { container } = renderWithTheme(<BookFairsPage />);
  const timeline = container.querySelector('.fair-timeline');
  const items = [...timeline.querySelectorAll(':scope > .mantine-Timeline-item')];
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) expect(item.querySelector('h2')).not.toBeNull();
 });
});
