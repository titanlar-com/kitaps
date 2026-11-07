import type { BookRecord, CatalogDocument } from './schema.ts';

/**
 * The one gate the catalogue passes on its way into the core (ADR 003, K10). The version is
 * always checked. The full contract runs in Node (tests and SEO scripts); the browser gets the
 * catalogue in the same build CI has already checked, so it checks the version and the shape
 * only. The gate reports and refuses; it never cleans, so uncertain evidence stays as it is.
 */
export const CATALOG_SCHEMA_VERSION = 1;

export class CatalogContractError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`The catalogue breaks its contract: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` and ${problems.length - 5} more` : ''}`);
    this.name = 'CatalogContractError';
    this.problems = problems;
  }
}

export interface OpenedCatalog {
  readonly document: CatalogDocument;
  /** 0 for today's unversioned file. */
  readonly schemaVersion: 0 | 1;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isDay = (value: unknown): boolean => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const LISTS = ['books', 'collections', 'groups', 'categories'] as const;
const BOOK_LISTS = ['aliases', 'years', 'categories', 'memberships', 'notes', 'editions', 'origins', 'legacyKeys', 'tags', 'collectionIds', 'groupIds'] as const;
const BOOK_TEXTS = ['title', 'titleTr', 'author'] as const;

/** The version and the top-level shape; what every open checks. */
function shapeProblems(input: unknown): string[] {
  if (!isObject(input)) return ['the catalogue must be a JSON object'];
  const problems: string[] = [];
  if ('schemaVersion' in input && input.schemaVersion !== undefined && input.schemaVersion !== CATALOG_SCHEMA_VERSION) problems.push(`schemaVersion ${JSON.stringify(input.schemaVersion)} is not one this code reads`);
  for (const list of LISTS) if (!Array.isArray(input[list])) problems.push(`${list} must be a list`);
  return problems;
}

/** Every defect of a catalogue document, as readable lines; empty when it keeps the contract. */
export function validateCatalog(input: unknown): string[] {
  const problems = shapeProblems(input);
  if (problems.length) return problems;
  const catalog = input as unknown as CatalogDocument;
  if (catalog.updatedOn !== undefined && !isDay(catalog.updatedOn)) problems.push('updatedOn is not a calendar day');
  const collections = new Set(catalog.collections.map(item => item.id));
  const groups = new Set(catalog.groups.map(item => item.id));
  const categories = new Set(catalog.categories.map(item => item.id));
  for (const group of catalog.groups) if (!collections.has(group.collectionId)) problems.push(`group ${group.id}: collection ${group.collectionId} does not exist`);
  const seen = new Set<string>();
  catalog.books.forEach((book: BookRecord, index) => {
    if (typeof book?.id !== 'string' || !book.id) { problems.push(`book ${index}: id is missing`); return; }
    const name = book.id;
    if (seen.has(name)) problems.push(`${name}: the id appears twice`);
    seen.add(name);
    // A title is required; an empty author or Turkish title means "unknown" (a series, a guide).
    for (const field of BOOK_TEXTS) if (typeof book[field] !== 'string' || (field === 'title' && !book[field])) problems.push(`${name}: ${field} is missing`);
    const lists = BOOK_LISTS.filter(field => !Array.isArray(book[field]));
    for (const field of lists) problems.push(`${name}: ${field} must be a list`);
    if (lists.length) return;
    // A book without an added day is new; tests/added-dates.test.js asks for it, as Python does.
    if (book.addedAt !== undefined && !isDay(book.addedAt)) problems.push(`${name}: addedAt is not a calendar day`);
    if (!book.years.every(year => Number.isInteger(year))) problems.push(`${name}: years must be whole numbers`);
    for (const id of book.collectionIds) if (!collections.has(id)) problems.push(`${name}: collection ${id} does not exist`);
    for (const id of book.groupIds) if (!groups.has(id)) problems.push(`${name}: group ${id} does not exist`);
    for (const id of book.categories) if (!categories.has(id)) problems.push(`${name}: category ${id} does not exist`);
    for (const membership of book.memberships) if (!collections.has(membership?.collectionId)) problems.push(`${name}: a membership points to collection ${membership?.collectionId}`);
  });
  return problems;
}

/** Opens a catalogue document after its gate: the version and shape always, the whole contract
 * with `validate: 'full'`. The document is used as it is, not copied. */
export function openCatalog(input: unknown, { validate = 'version' }: { validate?: 'version' | 'full' } = {}): OpenedCatalog {
  const problems = validate === 'full' ? validateCatalog(input) : shapeProblems(input);
  if (problems.length) throw new CatalogContractError(problems);
  const catalog = input as CatalogDocument;
  return { document: catalog, schemaVersion: catalog.schemaVersion === CATALOG_SCHEMA_VERSION ? 1 : 0 };
}
