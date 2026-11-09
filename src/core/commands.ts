import type { NavigationCommands, Route } from './navigation/navigator.ts';
import type { CommandResult, MarkResult, PersonalCommands } from './personal/library.ts';

/**
 * The one door a screen uses (ADR 003, K7): a command is a plain value, so any interface can
 * send one and a test can read one. The methods of each view model stay as the door's work.
 */
export type KitaplikCommand =
  | { type: 'openBook' | 'showBook' | 'addToQueue' | 'removeFromQueue'; id: string }
  | { type: 'closeBook' | 'back' | 'goHome' }
  | { type: 'go'; route: Route }
  | { type: 'goView'; view: string }
  | { type: 'openCollection'; id: string; groupId?: string }
  | { type: 'openCategory'; id: string }
  | { type: 'changeFilters'; filters: Record<string, unknown> }
  | { type: 'changeSort'; sort: string }
  | { type: 'changePage'; page: number }
  | { type: 'changePageSize'; pageSize: number }
  | { type: 'toggleMark'; id: string; key: string }
  | { type: 'editReading'; id: string; patch: Record<string, unknown> }
  | { type: 'moveInQueue'; id: string; direction: number }
  | { type: 'restoreBackup'; marks: Parameters<PersonalCommands['restoreBackup']>[0]; input: unknown }
  | { type: 'setHideOwned'; on: boolean };

export type CommandType = KitaplikCommand['type'];
type Of<T extends CommandType> = Extract<KitaplikCommand, { type: T }>;
type ResultOf<T extends CommandType> = T extends 'toggleMark' ? MarkResult
  : T extends 'editReading' | 'addToQueue' | 'moveInQueue' | 'removeFromQueue' | 'restoreBackup' ? CommandResult
    : void;
export type Execute = <T extends CommandType>(command: Of<T>) => ResultOf<T>;

interface Parts {
  navigation: Omit<NavigationCommands, 'correctPage'>;
  personal: PersonalCommands;
  settings: { setHideOwned(on: boolean): void };
}
type Doors = { [T in CommandType]: (command: Of<T>) => unknown };

const doorsOf = ({ navigation, personal, settings }: Parts): Doors => ({
  openBook: ({ id }) => navigation.openBook(id),
  showBook: ({ id }) => navigation.showBook(id),
  closeBook: () => navigation.closeBook(),
  back: () => navigation.back(),
  go: ({ route }) => navigation.go(route),
  goView: ({ view }) => navigation.goView(view),
  goHome: () => navigation.goHome(),
  openCollection: ({ id, groupId }) => navigation.openCollection(id, groupId),
  openCategory: ({ id }) => navigation.openCategory(id),
  changeFilters: ({ filters }) => navigation.changeFilters(filters),
  changeSort: ({ sort }) => navigation.changeSort(sort),
  changePage: ({ page }) => navigation.changePage(page),
  changePageSize: ({ pageSize }) => navigation.changePageSize(pageSize),
  toggleMark: ({ id, key }) => personal.toggleMark(id, key),
  editReading: ({ id, patch }) => personal.editReading(id, patch),
  addToQueue: ({ id }) => personal.addToQueue(id),
  moveInQueue: ({ id, direction }) => personal.moveInQueue(id, direction),
  removeFromQueue: ({ id }) => personal.removeFromQueue(id),
  restoreBackup: ({ marks, input }) => personal.restoreBackup(marks, input),
  setHideOwned: ({ on }) => settings.setHideOwned(on),
});

/** Every command's type, read from the doors, so the list cannot fall behind them. */
export const COMMAND_TYPES = Object.keys(doorsOf({ navigation: {}, personal: {}, settings: {} } as Parts)) as CommandType[];

export function createExecute(parts: Parts): Execute {
  const doors = doorsOf(parts) as unknown as Record<string, (command: KitaplikCommand) => unknown>;
  return ((command: KitaplikCommand) => {
    if (!Object.hasOwn(doors, command?.type)) throw new TypeError(`The core has no command ${String(command?.type)}.`);
    return doors[command.type](command);
  }) as Execute;
}
