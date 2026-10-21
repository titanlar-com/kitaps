import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import catalog from '../../src/catalog.json';
import EditionSummary from '../../src/components/EditionSummary';
import TranslationStatus from '../../src/components/TranslationStatus';
import ReadingPriorityCard from '../../src/components/ReadingPriorityCard';
import ReadingPrioritySummary from '../../src/components/ReadingPrioritySummary';
import BookDiscovery from '../../src/components/BookDiscovery';
import { ReadingPriorityEngine, ReadingRankingViewModel } from '../../src/ranking/ReadingPriorityEngine.ts';
import { renderWithTheme } from './render';

const book = id => catalog.books.find(item => item.id === id);
const ranking = new ReadingRankingViewModel(new ReadingPriorityEngine(catalog)).build();
const Cover = () => null;

describe('EditionSummary', () => {
  it('treats a Turkish original as a known Turkish edition', () => {
    renderWithTheme(<EditionSummary book={book('fadis')}/>);
    expect(screen.getByRole('heading', { name: 'Baskı bilgisi' })).toBeTruthy();
    expect(screen.queryByText(/Türkçe baskı doğrulanamadı/)).toBeNull();
    expect(screen.queryByText(/Özgün baskı · Amazon/)).toBeNull();
    expect(screen.queryByText('Çevirmen')).toBeNull();
    expect(screen.getByText('Altın Kitaplar')).toBeTruthy();
  });

  it('marks an unresearched book as unverified and offers the original edition', () => {
    renderWithTheme(<EditionSummary book={book('ageofunreason')}/>);
    expect(screen.getByText(/Türkçe baskı doğrulanamadı/)).toBeTruthy();
    expect(screen.getByText(/Özgün baskı · Amazon/)).toBeTruthy();
  });

  it('shows the source list’s trusted translation instead of “not verified”', () => {
    renderWithTheme(<EditionSummary book={book('oncompetition')}/>);
    expect(screen.getByText(/Kıvanç Tanrıyar/)).toBeTruthy();
    expect(screen.getByText(/Kaynak listesindeki doğrulanmış çeviri notundan alındı/)).toBeTruthy();
    expect(screen.queryByText(/Türkçe baskı doğrulanamadı/)).toBeNull();
  });

  it('gives an article its publication and text instead of an edition to buy', () => {
    const article = book('dilemmasinageneraltheoryofplanning');
    renderWithTheme(<EditionSummary book={article}/>);
    expect(screen.getByRole('heading', { name: 'Yayın bilgisi' })).toBeTruthy();
    expect(screen.getByText('Makale')).toBeTruthy();
    expect(screen.getByText(new RegExp(article.publication.venue))).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Metni oku|DOI kaydını aç|Yayın sayfasını aç/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Google Akademik/ })).toBeTruthy();
    expect(screen.queryByText(/Google Alışveriş/)).toBeNull();
    expect(screen.queryByText('Çevirmen')).toBeNull();
  });

  it('gives an essay its text link and no scholarly search', () => {
    renderWithTheme(<EditionSummary book={book('dothingsthatdontscale')}/>);
    expect(screen.getByText('Deneme')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Metni oku/ }).getAttribute('href')).toMatch(/^https:\/\/paulgraham\.com\//);
    expect(screen.queryByRole('link', { name: /Google Akademik/ })).toBeNull();
  });

  it('names the translator and evidence of a verified edition', () => {
    renderWithTheme(<EditionSummary book={book('competitivestrategy')}/>);
    expect(screen.getByText('Gülen Ulubilgen')).toBeTruthy();
    expect(screen.queryByText(/Henüz doğrulanmadı/)).toBeNull();
  });
});

describe('TranslationStatus', () => {
  it('uses a check for a Turkish edition and a cross for an unverified one', () => {
    const { container, unmount } = renderWithTheme(<TranslationStatus book={book('competitivestrategy')}/>);
    expect(container.querySelector('[data-status="available"] .tabler-icon-check')).toBeTruthy();
    unmount();
    const unverified = renderWithTheme(<TranslationStatus book={book('ageofunreason')}/>);
    const control = unverified.container.querySelector('[data-status="unverified"]');
    expect(control.querySelector('.tabler-icon-x')).toBeTruthy();
    expect(control.getAttribute('aria-label')).toMatch(/doğrulanamadı/);
  });

  it('shows nothing for a Turkish original', () => {
    const { container } = renderWithTheme(<TranslationStatus book={book('agirroman')}/>);
    expect(container.querySelector('.translation-status')).toBeNull();
  });
});

describe('reading priority', () => {
  it('states that purchases and reading activity never change the score', () => {
    renderWithTheme(<ReadingPriorityCard ranking={ranking.byId.goodtogreat}/>);
    expect(screen.getByText(/Satın alma, favori, okuma durumu, okuma kaydı ve kişisel sıra puanı değiştirmez/)).toBeTruthy();
    expect(screen.queryByText(/okuma durumları değiştiğinde/)).toBeNull();
    const badge = document.querySelector('.maturity-badge');
    expect(badge.dataset.level).toBe(String(ranking.byId.goodtogreat.maturity));
  });

  it('keeps the list summary to one line until the reader asks', async () => {
    renderWithTheme(<ReadingPrioritySummary ranking={ranking}/>);
    const toggle = screen.getByRole('button', { name: /Okuma önceliğine göre sıralı/ });
    const detail = document.getElementById('priority-summary-detail');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(detail.style.display).toBe('none');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await vi.waitFor(() => expect(detail.style.display).not.toBe('none'));
    expect(screen.getByText(/5 ölçüt/)).toBeTruthy();
    expect(screen.queryByText(/Şu an ilk/)).toBeNull();
  });
});

describe('BookDiscovery', () => {
  const discovery = id => renderWithTheme(<BookDiscovery book={book(id)} catalog={catalog} states={{}} onOpen={vi.fn()} onCategory={vi.fn()} onCollection={vi.fn()} BookCover={Cover}/>);

  it('suggests no preparation where the engine counts none', () => {
    discovery('goodtogreat');
    const before = screen.getByRole('button', { name: /Önce ne okumalıyım\? · 0/ });
    expect(before).toBeTruthy();
    expect(screen.getByText(/Doğrudan bu kitapla başlayabilirsin/)).toBeTruthy();
    expect(ranking.byId.goodtogreat.criteria.find(item => item.id === 'preparationFit').evidence).toMatch(/önerilmiyor/);
  });

  it('shows editorial preparation with its reason', () => {
    discovery('goodstrategybadstrategy');
    const panel = screen.getByRole('button', { name: /Önce ne okumalıyım\? · 4/ }).closest('.mantine-Accordion-item');
    expect(within(panel).getByText(/İşletme kavramlarına yeniysen/)).toBeTruthy();
  });
});
