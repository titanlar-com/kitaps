import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStateRepository, describeHealth } from '../src/state/health.ts';

// The shared state repository (titanlar-com/kitaps-state) is the app's database. This check reads
// it the way the app does and says plainly when it is gone, unreadable or holds what the
// catalogue no longer knows (owner's request, 7 November 2026). It runs on every push in CI.
const STATE = { schemaVersion: 2, updatedAt: '2026-11-07T10:00:00.000Z', books: {
 goal: { updatedAt: '2026-11-07T10:00:00.000Z', value: { states: ['alindi'] } },
 retired: { updatedAt: '2026-11-07T10:00:00.000Z', value: { states: ['okundu'] } },
}, queue: { updatedAt: '2026-11-07T10:00:00.000Z', value: ['goal'] } };
const ROUTES = { schemaVersion: 1, updatedAt: '2026-11-07T10:00:00.000Z', routes: {
 beyoglu: { updatedAt: '2026-11-07T10:00:00.000Z', value: { id: 'beyoglu', title: 'Beyoğlu', date: '2026-11-07', stops: ['minoa-pera', 'gone-store'], note: '', done: false } },
} };
const repoInfo = { full_name: 'titanlar-com/kitaps-state', private: false, archived: false, default_branch: 'main' };

/** A fake GitHub: path → [status, body]. */
const fakeFetch = answers => async url => {
 const key = Object.keys(answers).find(part => String(url).includes(part));
 const [status, body] = key ? answers[key] : [404, { message: 'Not Found' }];
 return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};
const run = answers => checkStateRepository({ fetch: fakeFetch(answers), bookIds: ['goal'], storeIds: ['minoa-pera'] });

test('a present repository with valid files is healthy, with its counts', async () => {
 const health = await run({ '/repos/titanlar-com/kitaps-state': [200, repoInfo], 'state.json': [200, STATE], 'routes.json': [200, ROUTES] });
 assert.equal(health.ok, true);
 assert.deepEqual(health.problems, []);
 assert.equal(health.facts.books, 2);
 assert.equal(health.facts.queue, 1);
 assert.equal(health.facts.routes, 1);
 // Records the catalogue no longer knows are reported, not treated as damage.
 assert.ok(health.warnings.some(text => text.includes('retired')));
 assert.ok(health.warnings.some(text => text.includes('gone-store')));
});

test('a missing state file means the repository is gone, renamed or private', async () => {
 const health = await run({ '/repos/titanlar-com/kitaps-state': [404, { message: 'Not Found' }] });
 assert.equal(health.ok, false);
 assert.ok(health.problems.some(text => /bulunamadı/.test(text)));
});

test('a private or archived repository is a problem the app cannot work around', async () => {
 const health = await run({ '/repos/titanlar-com/kitaps-state': [200, { ...repoInfo, private: true }], 'state.json': [200, STATE] });
 assert.equal(health.ok, false);
 assert.ok(health.problems.some(text => /herkese açık değil/.test(text)));
 const archived = await run({ '/repos/titanlar-com/kitaps-state': [200, { ...repoInfo, archived: true }], 'state.json': [200, STATE] });
 assert.ok(archived.problems.some(text => /arşivlenmiş/.test(text)));
});

test('a damaged state or routes file is a problem; a routes file not made yet is not', async () => {
 const damaged = await run({ '/repos/titanlar-com/kitaps-state': [200, repoInfo], 'state.json': [200, '{"schemaVersion": 2,'] });
 assert.equal(damaged.ok, false);
 assert.ok(damaged.problems.some(text => /state\.json/.test(text)));
 const wrong = await run({ '/repos/titanlar-com/kitaps-state': [200, repoInfo], 'state.json': [200, { ...STATE, schemaVersion: 9 }] });
 assert.equal(wrong.ok, false);
 const noRoutes = await run({ '/repos/titanlar-com/kitaps-state': [200, repoInfo], 'state.json': [200, STATE] });
 assert.equal(noRoutes.ok, true);
 assert.equal(noRoutes.facts.routes, 0);
 const badRoutes = await run({ '/repos/titanlar-com/kitaps-state': [200, repoInfo], 'state.json': [200, STATE], 'routes.json': [200, { schemaVersion: 7 }] });
 assert.equal(badRoutes.ok, false);
 assert.ok(badRoutes.problems.some(text => /routes\.json/.test(text)));
});

test('when GitHub limits anonymous requests, the repository facts are skipped, not failed', async () => {
 const health = await run({ '/repos/titanlar-com/kitaps-state': [403, { message: 'API rate limit exceeded' }], 'state.json': [200, STATE] });
 assert.equal(health.ok, true);
 assert.ok(health.warnings.some(text => /sınır/.test(text)));
});

test('the report reads plainly, annotates CI and fails the run only when told to', () => {
 const facts = { repository: 'titanlar-com/kitaps-state', books: 2, queue: 1, routes: 1, updatedAt: '2026-11-07T10:00:00.000Z' };
 const healthy = describeHealth({ ok: true, problems: [], warnings: [], facts });
 assert.equal(healthy.exitCode, 0);
 assert.match(healthy.text, /titanlar-com\/kitaps-state sağlıklı\./);
 assert.match(healthy.text, /2 kitap kaydı, okuma sırasında 1 kitap ve 1 rota var\./);
 assert.match(healthy.text, /7 Kasım 2026/);
 assert.doesNotMatch(healthy.text, /::/);

 const broken = { ok: false, problems: ['state.json okunamadı ya da bozuk: 100%\nbitti'], warnings: ['Bir uyarı.'], facts: { ...facts, updatedAt: null } };
 assert.equal(describeHealth(broken).exitCode, 1);
 assert.equal(describeHealth(broken, { warnOnly: true }).exitCode, 0);
 const annotated = describeHealth(broken, { github: true }).text;
 // GitHub reads one annotation per line, so its line breaks and percent signs are escaped.
 assert.ok(annotated.includes('::error title=Eşitleme deposu::state.json okunamadı ya da bozuk: 100%25%0Abitti'));
 assert.ok(annotated.includes('::warning title=Eşitleme deposu::Bir uyarı.'));
 assert.doesNotMatch(annotated, /[;—·→]/);
});
