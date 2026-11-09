// Mantine declares DataList as a value and a type namespace, and a JavaScript file cannot name that
// in an import list (TS18042). Reading it from the module keeps type checking on.
import * as Mantine from '@mantine/core';

export const DataList = Mantine.DataList;
