import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pagination=fs.readFileSync(new URL('../src/ui/react/components/CatalogPagination.jsx',import.meta.url),'utf8');

test('page-size dropdown uses the styled cross-platform Select',()=>{
 assert.match(pagination,/import \{[^}]*Select[^}]*\} from '@mantine\/core'/);
 assert.doesNotMatch(pagination,/NativeSelect|<select/);
 assert.match(pagination,/className="page-size-select"/);
 assert.match(pagination,/allowDeselect=\{false\}/);
 assert.match(pagination,/withinPortal:true/);
 assert.match(pagination,/data=\{PAGE_SIZES\.map\(/);
});
