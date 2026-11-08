import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fairsFrom, todayInIstanbul } from '../../src/fairs.js';
import { fairTimeline } from '../../src/core/places/fairs.js';

// The book fair calendar (owner's request, 7 November 2026), opened from the footer menu.
const data = JSON.parse(readFileSync(new URL('../../data/book-fairs.json', import.meta.url), 'utf8'));
const EMPTY = { schemaVersion: 2, updatedAt: '1970-01-01T00:00:00.000Z', books: {}, queue: null };
const shown = fairs => { const { open, coming, undated } = fairsFrom(fairs, todayInIstanbul()); return [...open, ...coming, ...undated].map(fair => fair.id).sort(); };

test.beforeEach(async ({ context }) => {
  await context.route('https://raw.githubusercontent.com/titanlar-com/kitaps-state/**', route => route.fulfill({ json: EMPTY }));
  await context.route('https://api.github.com/repos/titanlar-com/kitaps-state/**', route => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
});

const renderedIds = page => page.locator('.book-fair').evaluateAll(nodes => nodes.map(node => node.id.replace(/^fair-/, '')).sort());

test('the footer menu opens the calendar; finished fairs are gone and Türkiye or abroad can be chosen', async ({ page }) => {
  await page.goto('./');
  await page.locator('.footer-dock').click();
  await page.getByRole('dialog', { name: 'Menü' }).getByRole('button', { name: 'Kitap fuarları', exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=fairs\b/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kitap fuarları' })).toBeVisible();
  expect(await renderedIds(page)).toEqual(shown(data.fairs));
  await page.getByText('Türkiye', { exact: true }).click();
  expect(await renderedIds(page)).toEqual(shown(data.fairs.filter(fair => fair.country === 'Türkiye')));
  await page.getByText('Yurt dışı', { exact: true }).click();
  expect(await renderedIds(page)).toEqual(shown(data.fairs.filter(fair => fair.country !== 'Türkiye')));
});

test('a fair with dates can be added to a calendar as an all-day event', async ({ page }) => {
  await page.goto('./?view=fairs');
  const fair = page.locator('.book-fair').filter({ has: page.getByRole('button', { name: 'Takvime ekle' }) }).first();
  const id = (await fair.getAttribute('id')).replace(/^fair-/, '');
  const [file] = await Promise.all([page.waitForEvent('download'), fair.getByRole('button', { name: 'Takvime ekle' }).click()]);
  expect(file.suggestedFilename()).toBe(`${id}.ics`);
  const text = readFileSync(await file.path(), 'utf8');
  expect(text).toMatch(/BEGIN:VEVENT\r\n/);
  expect(text).toMatch(/DTSTART;VALUE=DATE:\d{8}\r\n/);
});

test('the calendar keeps its text inside at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }));
  const page = await context.newPage();
  await page.goto('./?view=fairs');
  await expect(page.getByRole('heading', { level: 1, name: 'Kitap fuarları' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll').toBe(true);
  await context.close();
});

// Redesign, phase 6 (docs/UI-REDESIGN.md): the calendar as a timeline by month.
const openCalendar = async page => {
  await page.goto('./?view=fairs');
  await expect(page.getByRole('heading', { level: 1, name: 'Kitap fuarları' })).toBeVisible();
};

test('the calendar is a timeline: open fairs first, then each month in date order', async ({ page }) => {
  await openCalendar(page);
  const { open, months } = fairTimeline(data.fairs, 'all', todayInIstanbul());
  const headings = page.locator('.fair-timeline > .mantine-Timeline-item h2');
  await expect(headings).toHaveText([...(open.length ? ['Şu an açık'] : []), ...months.map(month => month.label)]);
  for (const month of months) {
    const item = page.locator('.fair-timeline > .mantine-Timeline-item').filter({ has: page.getByRole('heading', { level: 2, name: month.label, exact: true }) });
    expect(await item.locator('.book-fair').evaluateAll(nodes => nodes.map(node => node.id.replace(/^fair-/, '')))).toEqual(month.fairs.map(fair => fair.id));
    await expect(item.locator('.fair-month-count')).toHaveText(month.countLabel);
  }
});

test('every choice of the Türkiye and abroad control stays on the screen at 320 px with 200% text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; }));
  const page = await context.newPage();
  await openCalendar(page);
  await page.evaluate(() => document.fonts.ready);
  const cut = await page.locator('.book-fairs-scope .mantine-SegmentedControl-control').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().right > innerWidth + .5).length);
  expect(cut).toBe(0);
  await context.close();
});

test('the month bullets are square and carry no text of their own', async ({ page }) => {
  await openCalendar(page);
  const bullets = await page.locator('.fair-timeline > .mantine-Timeline-item > .mantine-Timeline-itemBullet').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { radius: parseFloat(getComputedStyle(node).borderTopLeftRadius), width: box.width, height: box.height, text: node.textContent }; }));
  expect(bullets.length).toBeGreaterThan(0);
  for (const bullet of bullets) { expect(bullet.text).toBe(''); expect(bullet.radius).toBeLessThanOrEqual(5); expect(Math.abs(bullet.width - bullet.height)).toBeLessThan(.5); expect(bullet.width).toBeGreaterThan(2 * bullet.radius); }
});

test('a fair says in words where its date comes from, and how near it is', async ({ page }) => {
  await openCalendar(page);
  const { open, months, undated } = fairTimeline(data.fairs, 'all', todayInIstanbul());
  for (const fair of [...open, ...months.flatMap(month => month.fairs), ...undated]) {
    if (fair.badge) await expect(page.locator(`#fair-${fair.id} .place-badge`).filter({ hasText: fair.badge.label }), fair.id).toHaveCount(1);
    if (fair.countdown) await expect(page.locator(`#fair-${fair.id} .fair-countdown`), fair.id).toHaveText(fair.countdown.text);
    else await expect(page.locator(`#fair-${fair.id} .fair-countdown`), fair.id).toHaveCount(0);
    await expect(page.locator(`#fair-${fair.id} .book-fair-date`), fair.id).toHaveText(fair.when);
  }
  expect(await page.locator('.book-fair-date').first().evaluate(node => getComputedStyle(node).fontVariantNumeric)).toContain('tabular-nums');
});

test('the mark beside a near fair is square, not a dot', async ({ page }) => {
  // The clock is held inside a fair so the mark is always there, whatever day the suite runs.
  await page.clock.setFixedTime(new Date('2026-11-08T09:00:00Z'));
  await openCalendar(page);
  const mark = page.locator('.fair-countdown .mantine-Indicator-indicator').first();
  await expect(mark).toBeVisible();
  const box = await mark.evaluate(node => { const rect = node.getBoundingClientRect(); return { radius: parseFloat(getComputedStyle(node).borderTopLeftRadius), short: Math.min(rect.width, rect.height) }; });
  expect(box.radius).toBeLessThanOrEqual(5);
  expect(2 * box.radius).toBeLessThan(box.short);
});

for (const width of [320, 360, 375, 390, 768, 1280]) {
  test(`at ${width} px the calendar keeps its width and every text is at least 14 px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openCalendar(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll').toBe(true);
    const report = await page.locator('.book-fairs-page').evaluate(root => {
      const small = new Set();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) { const node = walker.currentNode; if (!node.textContent.trim() || !node.parentElement.getClientRects().length || node.parentElement.closest('.visually-hidden')) continue; if (parseFloat(getComputedStyle(node.parentElement).fontSize) < 14) small.add(node.textContent.trim().slice(0, 30)); }
      return { small: [...small], nested: root.querySelectorAll('.mantine-Card-root .mantine-Card-root').length, framed: [...root.querySelectorAll('.mantine-Card-root')].filter(card => parseFloat(getComputedStyle(card).borderTopWidth) > 0).length };
    });
    expect(report.small).toEqual([]);
    expect(report.nested).toBe(0);
    expect(report.framed).toBe(0);
  });
}
