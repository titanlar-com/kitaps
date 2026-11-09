import { STATE_LABELS } from './marks.js';
import { cleanPersonal } from './reading.js';

/** The reader's own backup file: written here, and read by the format it says it has (ADR 003). */
export const BACKUP_VERSION = 3;

/** `kind` says why a file was refused: 'unreadable', 'newer' or 'other-file'. The screen words it. */
export class BackupError extends Error {
  constructor(kind) {
    super(`The backup was refused: ${kind}`);
    this.name = 'BackupError';
    this.kind = kind;
  }
}

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const refuse = kind => { throw new BackupError(kind); };
const heldFields = input => ['states', 'queue', 'reading'].some(field => field in input);

// Where each format keeps the marks. A new format adds its reader here and raises BACKUP_VERSION.
const fields = input => heldFields(input) ? (input.states ?? {}) : refuse('other-file');
const READERS = { 1: fields, 2: fields, 3: fields };
// Before versions a file was either the marks themselves or an object with `states`.
const unversioned = input => {
  if (heldFields(input)) return input.states ?? {};
  const values = Object.values(input);
  return values.length && !values.some(Array.isArray) ? refuse('other-file') : input;
};

export const createBackup = ({ states, personal }, now = new Date()) => ({ version: BACKUP_VERSION, exportedAt: now.toISOString(), states, ...personal });

/** Reads a parsed backup, or throws BackupError and hands back nothing of it. */
export function readBackup(input, bookIds) {
  if (!isRecord(input)) refuse('unreadable');
  const { version } = input;
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) refuse('unreadable');
  if (version > BACKUP_VERSION) refuse('newer');
  const supplied = version === undefined ? unversioned(input) : READERS[version](input);
  if (!isRecord(supplied)) refuse('unreadable');
  const known = new Set(bookIds);
  const marks = Object.fromEntries(Object.entries(supplied).filter(([id, value]) => known.has(id) && Array.isArray(value)).map(([id, value]) => [id, value.filter(mark => mark in STATE_LABELS)]));
  return { version, marks, personal: cleanPersonal(input, bookIds), hasQueue: Array.isArray(input.queue), input };
}
