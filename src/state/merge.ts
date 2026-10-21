import {
  BOOK_FIELDS,
  EXCLUSIVE_STATE_GROUPS,
  LEGACY_STATE_SCHEMA_VERSION,
  MAX_QUEUE_LENGTH,
  STATE_SCHEMA_VERSION,
  type BookField,
  type BookStatePayload,
  type BookStateRecord,
  type MutationBasis,
  MAX_SENT_VERSIONS,
  type PendingStateMutation,
  type ReadingProgress,
  type QueueRecord,
  type ReadingState,
  type StateDocument,
} from './types.ts';

const validTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const readingStates = new Set<ReadingState>(['onemli', 'alinacak', 'alindi', 'okunuyor', 'araverildi', 'birakildi', 'okundu']);
const exactKeys = (value: object, allowed: string[]): boolean => Object.keys(value).every(key => allowed.includes(key));
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const later = (left: string | undefined, right: string | undefined): string | undefined =>
  !left ? right : !right ? left : Date.parse(left) >= Date.parse(right) ? left : right;

function assertReading(value: unknown, bookId: string): void {
  if (!isObject(value) || !exactKeys(value, ['startedAt', 'finishedAt', 'page', 'totalPages', 'why', 'apply'])) throw new TypeError(`Invalid reading data for ${bookId}.`);
  for (const key of ['startedAt', 'finishedAt', 'why', 'apply']) if (key in value && typeof value[key] !== 'string') throw new TypeError(`Invalid ${key} for ${bookId}.`);
  for (const key of ['page', 'totalPages']) if (key in value && (!Number.isInteger(value[key]) || (value[key] as number) < 0)) throw new TypeError(`Invalid ${key} for ${bookId}.`);
}

export function assertBookStatePayload(value: unknown, bookId = '<unknown>'): asserts value is BookStatePayload {
  if (!isObject(value) || !exactKeys(value, ['states', 'reading'])) throw new TypeError(`Invalid value for ${bookId}.`);
  if ('states' in value && (!Array.isArray(value.states) || new Set(value.states).size !== value.states.length || value.states.some(state => typeof state !== 'string' || !readingStates.has(state as ReadingState)))) throw new TypeError(`Invalid states for ${bookId}.`);
  if ('reading' in value && value.reading !== null) assertReading(value.reading, bookId);
}

export function assertQueue(value: unknown, context = 'queue'): asserts value is string[] {
  if (!Array.isArray(value) || value.length > MAX_QUEUE_LENGTH || value.some(id => typeof id !== 'string' || !id.trim()) || new Set(value).size !== value.length) {
    throw new TypeError(`Invalid ${context}.`);
  }
}

function assertStamps(value: unknown, bookId: string): void {
  if (!isObject(value) || !exactKeys(value, [...BOOK_FIELDS])) throw new TypeError(`Invalid stamps for ${bookId}.`);
  for (const stamp of Object.values(value)) if (!validTimestamp(stamp)) throw new TypeError(`Invalid stamp for ${bookId}.`);
}

export function publicStatePayload(value: BookStatePayload | null): BookStatePayload | null {
  if (value === null) return null;
  const payload: BookStatePayload = {};
  if (value.states) payload.states = [...value.states];
  if (value.reading !== undefined) payload.reading = value.reading === null ? null : structuredClone(value.reading);
  return payload;
}

/** Copies only known public fields, so nothing unexpected is ever written. */
export function publicStateDocument(document: StateDocument): StateDocument {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: document.updatedAt,
    books: Object.fromEntries(Object.entries(document.books).map(([bookId, record]) => [bookId, {
      updatedAt: record.updatedAt,
      value: publicStatePayload(record.value),
      ...(record.stamps ? { stamps: { ...record.stamps } } : {}),
    }])),
    queue: document.queue ? { updatedAt: document.queue.updatedAt, value: [...document.queue.value] } : null,
  };
}

export function emptyStateDocument(updatedAt = new Date(0).toISOString()): StateDocument {
  return { schemaVersion: STATE_SCHEMA_VERSION, updatedAt, books: {}, queue: null };
}

export function assertStateDocument(value: unknown): asserts value is StateDocument {
  if (!isObject(value) || !exactKeys(value, ['schemaVersion', 'updatedAt', 'books', 'queue'])) throw new TypeError('State document must be an object with known fields.');
  if (value.schemaVersion !== STATE_SCHEMA_VERSION) throw new TypeError(`Unsupported state schema version: ${String(value.schemaVersion)}.`);
  if (!validTimestamp(value.updatedAt)) throw new TypeError('State document updatedAt must be a valid timestamp.');
  if (!isObject(value.books)) throw new TypeError('State document books must be an object.');
  for (const [bookId, record] of Object.entries(value.books)) {
    if (!bookId.trim() || !isObject(record) || !exactKeys(record, ['updatedAt', 'value', 'stamps'])) throw new TypeError(`Invalid state record for ${bookId || '<empty>'}.`);
    if (!validTimestamp(record.updatedAt)) throw new TypeError(`Invalid updatedAt for ${bookId}.`);
    if (record.value !== null) assertBookStatePayload(record.value, bookId);
    if ('stamps' in record) assertStamps(record.stamps, bookId);
  }
  if (value.queue !== null) {
    if (!isObject(value.queue) || !exactKeys(value.queue, ['updatedAt', 'value']) || !validTimestamp(value.queue.updatedAt)) throw new TypeError('Invalid queue record.');
    assertQueue(value.queue.value);
  }
}

/** Reads a version 1 file (per-book queue positions) as a version 2 document. */
export function upgradeStateDocument(value: unknown): unknown {
  if (!isObject(value) || value.schemaVersion !== LEGACY_STATE_SCHEMA_VERSION || !isObject(value.books)) return value;
  const positions: Array<[number, string, string]> = [];
  const books: Record<string, BookStateRecord> = {};
  for (const [bookId, record] of Object.entries(value.books)) {
    if (!isObject(record)) throw new TypeError(`Invalid state record for ${bookId}.`);
    const legacy = isObject(record.value) ? record.value : null;
    if (legacy && Number.isInteger(legacy.queuePosition)) positions.push([legacy.queuePosition as number, bookId, String(record.updatedAt)]);
    const payload = legacy ? Object.fromEntries(Object.entries(legacy).filter(([key]) => key !== 'queuePosition')) as BookStatePayload : null;
    books[bookId] = { updatedAt: String(record.updatedAt), value: payload };
  }
  positions.sort((left, right) => left[0] - right[0] || left[1].localeCompare(right[1]));
  const queue: QueueRecord | null = positions.length
    ? { updatedAt: positions.map(item => item[2]).reduce((newest, stamp) => later(newest, stamp) ?? stamp), value: positions.slice(0, MAX_QUEUE_LENGTH).map(item => item[1]) }
    : null;
  return { schemaVersion: STATE_SCHEMA_VERSION, updatedAt: value.updatedAt, books, queue };
}

export function assertPendingMutation(value: unknown): asserts value is PendingStateMutation {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id || !validTimestamp(value.updatedAt)) throw new TypeError('Invalid pending state mutation.');
  if (value.kind === 'book') {
    if (!exactKeys(value, ['id', 'kind', 'bookId', 'updatedAt', 'value']) || typeof value.bookId !== 'string' || !value.bookId.trim()) throw new TypeError('Invalid pending book mutation.');
    if (value.value !== null) assertBookStatePayload(value.value, value.bookId);
  } else if (value.kind === 'queue') {
    if (!exactKeys(value, ['id', 'kind', 'updatedAt', 'value'])) throw new TypeError('Invalid pending queue mutation.');
    assertQueue(value.value, 'pending queue');
  } else {
    throw new TypeError('Invalid pending state mutation kind.');
  }
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
};
const same = (left: unknown, right: unknown): boolean => canonical(left) === canonical(right);
const sameMarks = (left: readonly string[], right: readonly string[]): boolean => same([...left].sort(), [...right].sort());

/** Marks, three-way: what this device removed since its base goes, what it added comes,
 * everything else is the shared file's. Two marks that exclude each other (alinacak and
 * alindi; okunuyor, okundu, araverildi and birakildi) leave the one set later. */
export function mergeStates(base: readonly ReadingState[], local: readonly ReadingState[], remote: readonly ReadingState[], remoteLater: boolean): ReadingState[] {
  const added = local.filter(state => !base.includes(state));
  const removed = new Set(base.filter(state => !local.includes(state)));
  const result = [...remote.filter(state => !removed.has(state)), ...added.filter(state => !remote.includes(state))];
  const remoteAdded = remote.filter(state => !base.includes(state));
  for (const group of EXCLUSIVE_STATE_GROUPS) {
    const present = result.filter(state => group.includes(state));
    if (present.length < 2) continue;
    const mine = present.find(state => added.includes(state));
    const theirs = present.find(state => remoteAdded.includes(state));
    const keep = mine && theirs ? (remoteLater ? theirs : mine) : mine ?? theirs ?? present[0];
    for (const state of present) if (state !== keep) result.splice(result.indexOf(state), 1);
  }
  return result;
}

/** The reading record, three-way and part by part (dates, pages, notes): a part this
 * device changed takes its value, a part only the shared file changed keeps that one;
 * where both changed the same part differently, the one changed later stays. */
export function mergeReading(base: ReadingProgress | null, local: ReadingProgress | null, remote: ReadingProgress | null, remoteLater: boolean): ReadingProgress | null {
  const before = (base ?? {}) as Record<string, unknown>, mine = (local ?? {}) as Record<string, unknown>, theirs = (remote ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const changedHere = !same(mine[key], before[key]), changedThere = !same(theirs[key], before[key]);
    const value = changedHere && changedThere && !same(mine[key], theirs[key]) ? (remoteLater ? theirs[key] : mine[key]) : changedHere ? mine[key] : theirs[key];
    if (value !== undefined) result[key] = structuredClone(value);
  }
  return Object.keys(result).length ? result as ReadingProgress : null;
}

/** The reading queue, three-way: the books either side took out go, the books either side
 * put in come. The side that changed the queue later leads: its order holds for the books
 * it shows, the other side's own books keep their place after the book they followed, and
 * where more than MAX_QUEUE_LENGTH books remain, the other side's own books go first. */
export function mergeQueue(base: readonly string[], local: readonly string[], remote: readonly string[], remoteLater: boolean): string[] {
  const removedHere = new Set(base.filter(id => !local.includes(id)));
  const kept = new Set([...remote.filter(id => !removedHere.has(id)), ...local.filter(id => !base.includes(id))]);
  const [lead, follow] = remoteLater ? [remote, local] : [local, remote];
  const result = lead.filter(id => kept.has(id));
  const followOnly: string[] = [];
  follow.forEach((id, index) => {
    if (!kept.has(id) || result.includes(id)) return;
    const before = follow.slice(0, index).reverse().find(other => result.includes(other));
    result.splice(before === undefined ? 0 : result.indexOf(before) + 1, 0, id);
    followOnly.push(id);
  });
  while (result.length > MAX_QUEUE_LENGTH) result.splice(result.lastIndexOf(followOnly.pop() ?? result.at(-1)!), 1);
  return result;
}

/** Checks a mutation's basis before it is trusted; a basis that does not fit its
 * mutation is not used, and the edit merges as one without a basis. */
export function assertMutationBasis(value: unknown, mutation: PendingStateMutation): asserts value is MutationBasis {
  if (!isObject(value) || value.kind !== mutation.kind) throw new TypeError('Invalid mutation basis.');
  if (!(value.sent === undefined || (Array.isArray(value.sent) && value.sent.length <= MAX_SENT_VERSIONS))) throw new TypeError('Invalid sent versions.');
  if (mutation.kind === 'queue') {
    if (!exactKeys(value, ['kind', 'base', 'sent'])) throw new TypeError('Invalid queue basis.');
    assertQueue(value.base, 'queue basis');
    for (const version of (value.sent ?? []) as unknown[]) {
      if (!isObject(version) || !exactKeys(version, ['stamp', 'value']) || !validTimestamp(version.stamp)) throw new TypeError('Invalid sent queue.');
      assertQueue(version.value, 'sent queue');
    }
    return;
  }
  const stampsOf = (stamps: unknown): void => {
    if (!isObject(stamps) || !exactKeys(stamps, [...BOOK_FIELDS])) throw new TypeError('Invalid basis stamps.');
    for (const stamp of Object.values(stamps)) if (!validTimestamp(stamp)) throw new TypeError('Invalid basis stamp.');
  };
  if (!exactKeys(value, ['kind', 'stamps', 'base', 'sent'])) throw new TypeError('Invalid book basis.');
  stampsOf(value.stamps);
  assertBookStatePayload(value.base, mutation.kind === 'book' ? mutation.bookId : undefined);
  for (const version of (value.sent ?? []) as unknown[]) {
    if (!isObject(version) || !exactKeys(version, ['stamps', 'value'])) throw new TypeError('Invalid sent version.');
    stampsOf(version.stamps);
    assertBookStatePayload(version.value, mutation.kind === 'book' ? mutation.bookId : undefined);
  }
}

/** Applies this device's unsent edits to the newest remote file.
 *
 * With a basis (what each edit was made on, by mutation id), a field the shared file has
 * not changed since takes this device's value exactly; one it has changed is merged
 * three-way (mergeStates, mergeReading, mergeQueue), so two devices that edited the same
 * book or the queue before seeing each other both keep their edits.
 *
 * Without one (an edit queued by older code), each field is last-writer-wins: a field
 * another device changed after the local edit keeps the other device's value. Fields an
 * edit does not carry are never disturbed, and clearing a book stays whole-record. */
export function applyPendingMutations(base: StateDocument, mutations: readonly PendingStateMutation[], bases: ReadonlyMap<string, MutationBasis> = new Map()): StateDocument {
  assertStateDocument(base);
  const books: Record<string, BookStateRecord> = structuredClone(base.books);
  let queue: QueueRecord | null = base.queue ? structuredClone(base.queue) : null;
  let updatedAt = base.updatedAt;

  for (const mutation of mutations) {
    assertPendingMutation(mutation);
    const basis = bases.get(mutation.id);
    if (mutation.kind === 'queue') {
      const shared = queue?.value ?? [];
      const remoteLater = Boolean(queue) && Date.parse(queue!.updatedAt) > Date.parse(mutation.updatedAt);
      if (basis?.kind === 'queue') {
        // A send whose answer never came, which the shared queue still carries, is the base.
        const landed = queue ? [...(basis.sent ?? [])].reverse().find(version => Date.parse(version.stamp) === Date.parse(queue!.updatedAt)) : undefined;
        const before = landed?.value ?? basis.base;
        const value = same(shared, before) ? [...mutation.value] : mergeQueue(before, mutation.value, shared, remoteLater);
        queue = { updatedAt: later(queue?.updatedAt, mutation.updatedAt)!, value };
      } else {
        if (remoteLater) continue;
        queue = { updatedAt: mutation.updatedAt, value: [...mutation.value] };
      }
      updatedAt = later(updatedAt, mutation.updatedAt)!;
      continue;
    }

    const current = books[mutation.bookId];
    if (mutation.value === null) {
      if (current && Date.parse(current.updatedAt) > Date.parse(mutation.updatedAt)) continue;
      books[mutation.bookId] = { updatedAt: mutation.updatedAt, value: null };
      updatedAt = later(updatedAt, mutation.updatedAt)!;
      continue;
    }

    const book = basis?.kind === 'book' ? basis : undefined;
    const value: BookStatePayload = { ...structuredClone(current?.value ?? {}) };
    const stamps: Partial<Record<BookField, string>> = { ...(current?.stamps ?? {}) };
    let applied = false;
    for (const field of BOOK_FIELDS) {
      if (!(field in mutation.value)) continue;
      // Each field keeps the time of its own last edit on this device.
      const editedAt = book?.stamps[field] ?? mutation.updatedAt;
      // Records written before field stamps existed fall back to their record time.
      const remoteStamp = stamps[field] ?? (current && !current.stamps ? current.updatedAt : undefined);
      const remoteLater = Boolean(remoteStamp) && Date.parse(remoteStamp!) > Date.parse(editedAt);
      const hasBase = Boolean(book) && field in book!.base;
      if (!hasBase && remoteLater) continue;
      // A send whose answer never came, which the shared field still carries, is the base.
      const landed = hasBase && remoteStamp ? [...(book!.sent ?? [])].reverse().find(version => version.stamps[field] && Date.parse(version.stamps[field]!) === Date.parse(remoteStamp) && field in version.value) : undefined;
      const basePayload = landed?.value ?? book?.base;
      if (field === 'states') {
        const mine = mutation.value.states ?? [], theirs = current?.value?.states ?? [];
        const before = hasBase ? basePayload!.states ?? [] : theirs;
        value.states = !hasBase || sameMarks(theirs, before) ? [...mine] : mergeStates(before, mine, theirs, remoteLater);
      } else {
        const mine = mutation.value.reading ?? null, theirs = current?.value?.reading ?? null;
        const before = hasBase ? basePayload!.reading ?? null : theirs;
        value.reading = !hasBase || same(theirs, before) ? structuredClone(mine) : mergeReading(before, mine, theirs, remoteLater);
      }
      stamps[field] = later(remoteStamp, editedAt)!;
      applied = true;
    }
    if (!applied) continue;
    const newest = Object.values(stamps).reduce<string | undefined>((result, stamp) => later(result, stamp), current?.updatedAt);
    books[mutation.bookId] = { updatedAt: newest ?? mutation.updatedAt, value, stamps };
    updatedAt = later(updatedAt, newest ?? mutation.updatedAt)!;
  }

  return { schemaVersion: STATE_SCHEMA_VERSION, updatedAt, books, queue };
}
