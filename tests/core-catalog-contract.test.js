import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATALOG_SCHEMA_VERSION, CatalogContractError, openCatalog, validateCatalog } from '../src/core/catalog/contract.ts';

// The catalogue contract (ADR 003, K10). The Python build writes src/catalog.json. The core
// opens it through one gate: the version is checked always, the full contract in Node (tests,
// SEO scripts). Validation reports, it never cleans: uncertain evidence stays as it is.
const real = JSON.parse(fs.readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));

const book = (id, extra = {}) => ({ id, title: id, titleTr: id, author: 'Yazar', aliases: [], years: [1999], categories: ['strateji'], memberships: [{ collectionId: 'c1' }], notes: [], editions: [], origins: ['atlas'], legacyKeys: [], tags: [], addedAt: '2026-11-08', collectionIds: ['c1'], groupIds: ['g1'], ...extra });
const small = (books = [book('a'), book('b')], extra = {}) => ({ updated: '8 Kasım 2026', readingGuides: {}, books, collections: [{ id: 'c1', title: 'Küme' }], groups: [{ id: 'g1', collectionId: 'c1', title: 'Grup' }], categories: [{ id: 'strateji', label: 'Strateji' }], sourceTags: {}, mapping: {}, sourceCounts: {}, ...extra });

test('the real catalogue keeps the whole contract', () => {
  assert.deepEqual(validateCatalog(real), []);
  assert.equal(openCatalog(real, { validate: 'full' }).document, real, 'opening does not copy or clean the document');
});

test('today\'s unversioned file and version 1 open; any other version is refused with a clear reason', () => {
  assert.equal(CATALOG_SCHEMA_VERSION, 1);
  assert.equal(openCatalog(small()).schemaVersion, 0, 'no schemaVersion is the legacy format');
  assert.equal(openCatalog(small([book('a')], { schemaVersion: 1, updatedOn: '2026-11-08' })).schemaVersion, 1);
  for (const version of [2, '1', null]) {
    assert.throws(() => openCatalog(small([book('a')], { schemaVersion: version })), error => error instanceof CatalogContractError && /schemaVersion/.test(error.message), String(version));
  }
  for (const input of [null, [], 'katalog', { books: 'x' }, { ...small(), collections: undefined }]) {
    assert.throws(() => openCatalog(input), CatalogContractError);
  }
});

test('the full contract names each defect and keeps the data as it is', () => {
  const cases = [
    [small([book('a'), book('a')]), /a: the id appears twice/],
    [small([book('a', { collectionIds: ['nope'] })]), /a: collection nope does not exist/],
    [small([book('a', { groupIds: ['nope'] })]), /a: group nope does not exist/],
    [small([book('a', { categories: ['nope'] })]), /a: category nope does not exist/],
    [small([book('a', { memberships: [{ collectionId: 'nope' }] })]), /a: a membership points to collection nope/],
    [small([book('a', { addedAt: '8 Kasım' })]), /a: addedAt is not a calendar day/],
    [small([book('a', { years: ['1999'] })]), /a: years must be whole numbers/],
    [small([book('a', { title: '' })]), /a: title is missing/],
    [small([book('a', { aliases: undefined })]), /a: aliases must be a list/],
    [small([book('')]), /book 0: id is missing/],
    [small([book('a')], { groups: [{ id: 'g1', collectionId: 'nope', title: 'Grup' }] }), /group g1: collection nope does not exist/],
    [small([book('a')], { schemaVersion: 1, updatedOn: 'dün' }), /updatedOn is not a calendar day/],
  ];
  for (const [document, expected] of cases) {
    const before = JSON.stringify(document);
    const problems = validateCatalog(document);
    assert.ok(problems.some(problem => expected.test(problem)), `${expected}: ${problems.join(' | ')}`);
    assert.equal(JSON.stringify(document), before, 'validation changes nothing');
    assert.throws(() => openCatalog(document, { validate: 'full' }), error => error instanceof CatalogContractError && expected.test(error.message));
  }
  // Missing optional evidence is not a defect: an unknown page count or author stays unknown.
  assert.deepEqual(validateCatalog(small([book('a', { cover: undefined, pageCounts: undefined, author: '' })])), []);
  // Python leaves a new book undated and only warns; the contract is not stricter than the build.
  const { addedAt, ...undated } = book('b');
  assert.deepEqual(validateCatalog(small([undated])), []);
});
