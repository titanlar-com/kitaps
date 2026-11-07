import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fairsFrom, todayInIstanbul } from '../../src/fairs.js';

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
