import { createStore, type ViewModel } from '../store.ts';
import type { KeyValueStore } from '../settings/settings.ts';
import { migrateStates, toggleState } from './marks.js';
import { PERSONAL_KEY, addToQueue, cleanPersonal, cleanReading, moveInQueue, restorePersonal, stampReadingDate, todayLocal } from './reading.js';

export const STATE_KEY = 'kitapatlasi:states:v2';
export const LEGACY_STATE_KEY = 'kitaps:states:v1';

type Marks = Record<string, string[]>;
type ReadingRecords = Record<string, Record<string, unknown>>;
export interface PersonalRecords { queue: string[]; reading: ReadingRecords }
/** The reader's data as it is kept and sent: marks by book, and the queue with the reading records. */
export interface PersonalData { states: Marks; personal: PersonalRecords }
export interface PersonalSnapshot extends PersonalData {
  /** False while the last write of any part failed: the change holds for this visit only. */
  readonly saved: boolean;
}
export interface CommandResult { readonly saved: boolean }
export interface MarkResult extends CommandResult { readonly before: readonly string[]; readonly after: readonly string[] }
export interface PersonalCommands {
  toggleMark(id: string, key: string): MarkResult;
  editReading(id: string, patch: Record<string, unknown>): CommandResult;
  addToQueue(id: string): CommandResult;
  moveInQueue(id: string, direction: number): CommandResult;
  removeFromQueue(id: string): CommandResult;
  restoreBackup(marks: Marks, input: unknown): CommandResult;
}
export interface PersonalLibrary extends ViewModel<PersonalSnapshot, PersonalCommands> {
  /** Takes over what was read from the shared file, in one step (ADR 003, K7). Only sync calls it. */
  applyRemote(update: (current: PersonalData) => PersonalData): void;
}

interface LibraryOptions {
  storage: KeyValueStore;
  books: readonly { id: string; legacyKeys: string[] }[];
  now: () => Date;
}

/**
 * The one owner of a reader's marks, reading records and queue (ADR 003, phase 7a). Every change
 * is one step: one notification, and each part written once under the keys older tabs also read.
 */
export function createPersonalLibrary({ storage, books, now }: LibraryOptions): PersonalLibrary {
  const bookIds = books.map(book => book.id);
  const read = (key: string): unknown => { try { return JSON.parse(storage.read(key) || '{}'); } catch { return {}; } };
  const opened: PersonalData = {
    states: migrateStates(books, read(STATE_KEY), read(LEGACY_STATE_KEY)),
    personal: cleanPersonal(read(PERSONAL_KEY), bookIds),
  };
  const written = { states: storage.write(STATE_KEY, JSON.stringify(opened.states)), personal: storage.write(PERSONAL_KEY, JSON.stringify(opened.personal)) };
  const store = createStore<PersonalSnapshot>({ ...opened, saved: written.states && written.personal });

  const commit = (next: PersonalData): boolean => {
    const current = store.getSnapshot();
    if (next.states !== current.states) written.states = storage.write(STATE_KEY, JSON.stringify(next.states));
    if (next.personal !== current.personal) written.personal = storage.write(PERSONAL_KEY, JSON.stringify(next.personal));
    const saved = written.states && written.personal;
    store.set({ states: next.states, personal: next.personal, saved });
    return saved;
  };
  const changePersonal = (change: (records: PersonalRecords) => PersonalRecords): CommandResult => {
    const current = store.getSnapshot();
    return { saved: commit({ states: current.states, personal: change(current.personal) }) };
  };

  const commands: PersonalCommands = Object.freeze({
    toggleMark(id: string, key: string): MarkResult {
      const current = store.getSnapshot();
      const before = current.states[id] || [];
      const after = toggleState(before, key);
      // Being read or read writes the day once (stampReadingDate); taking a mark off writes none.
      const personal = before.includes(key) ? current.personal : stampReadingDate(current.personal, id, key, todayLocal(now()));
      return { before, after, saved: commit({ states: { ...current.states, [id]: after }, personal }) };
    },
    editReading: (id: string, patch: Record<string, unknown>) => changePersonal(records => ({ ...records, reading: { ...records.reading, [id]: cleanReading({ ...records.reading[id], ...patch }) } })),
    addToQueue: (id: string) => changePersonal(records => ({ ...records, queue: addToQueue(records.queue, id) })),
    moveInQueue: (id: string, direction: number) => changePersonal(records => ({ ...records, queue: moveInQueue(records.queue, id, direction) })),
    removeFromQueue: (id: string) => changePersonal(records => ({ ...records, queue: records.queue.filter(value => value !== id) })),
    restoreBackup(marks: Marks, input: unknown): CommandResult {
      const current = store.getSnapshot();
      return { saved: commit({ states: { ...current.states, ...marks }, personal: restorePersonal(current.personal, input, bookIds) }) };
    },
  });

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    commands,
    applyRemote(update) {
      const { states, personal } = store.getSnapshot();
      commit(update({ states, personal }));
    },
    dispose: () => undefined,
  };
}
