/**
 * The shape of src/catalog.json as scripts/merge-data.py writes it (ADR 003, K10). Every book
 * has the required fields; the optional ones are evidence some books have and others lack, and
 * a missing one means "unknown", never "none". Fields the core does not read yet are typed
 * loosely, so the build may add fields without a version change.
 */
export type BookId = string;
export type IsoDay = string;

export interface MembershipRecord {
  collectionId: string;
  groupId?: string;
  order?: number;
  role?: string;
  note?: string;
  guide?: string;
  source?: string;
  award?: string;
  awardYear?: number;
}

export interface EditionRecord {
  id?: string;
  key?: string;
  turkish?: string;
  original?: string;
  author?: string;
  translator?: string;
  publisher?: string;
  status?: string;
  trust?: string;
  note?: string;
  section?: string;
  sectionLabel?: string;
  [field: string]: unknown;
}

export interface BookRecord {
  id: BookId;
  title: string;
  titleTr: string;
  author: string;
  aliases: string[];
  years: number[];
  categories: string[];
  memberships: MembershipRecord[];
  notes: { text: string; [field: string]: unknown }[];
  editions: EditionRecord[];
  origins: string[];
  legacyKeys: string[];
  tags: string[];
  /** Missing for a book merged before scripts/infer-added-dates.py dated it. */
  addedAt?: IsoDay;
  collectionIds: string[];
  groupIds: string[];
  cover?: Record<string, unknown>;
  originalTitle?: string;
  originalLanguage?: string;
  originalPublisher?: string;
  pageCounts?: Record<string, unknown>;
  verifiedEdition?: Record<string, unknown>;
  translationResearch?: Record<string, unknown>;
  childAge?: string;
  childCaution?: string;
  sourceIssue?: unknown;
  format?: string;
  publication?: Record<string, unknown>;
  /** The author line a book's address was first built from, kept after a correction. */
  slugAuthor?: string;
  preparation?: unknown;
}

export interface CollectionRecord {
  id: string;
  title: string;
  short?: string;
  description?: string;
  /** The number of books merged into the collection. */
  count?: number;
  /** The number of records in the source list, which can differ from `count`. */
  originalCount?: number;
  groupIds?: string[];
  [field: string]: unknown;
}

export interface GroupRecord {
  id: string;
  collectionId: string;
  title: string;
  count?: number;
  [field: string]: unknown;
}

export interface CategoryRecord {
  id: string;
  label: string;
  count?: number;
}

export interface CatalogDocument {
  /** Missing in files written before ADR 003 (the legacy format, version 0). */
  schemaVersion?: 1;
  /** The date of the newest evidence, as Turkish readers write it ("22 Ekim 2026"). Not a build time. */
  updated: string;
  /** The same date as a calendar day (version 1 on). */
  updatedOn?: IsoDay;
  readingGuides: Record<string, unknown>;
  books: BookRecord[];
  collections: CollectionRecord[];
  groups: GroupRecord[];
  categories: CategoryRecord[];
  sourceTags: Record<string, unknown>;
  mapping: Record<string, string>;
  sourceCounts: Record<string, number>;
}
