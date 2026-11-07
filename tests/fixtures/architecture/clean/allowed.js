// A comment may name window, document.title, localStorage.getItem('x') or import 'react'.
import { VIEWS } from '../../../../src/views.js';
import { SITE_URL } from '../../../../src/site.js';
import { EXCLUSIVE_STATE_GROUPS } from '../../../../src/state/types.ts';
import { sibling } from './sibling.js';
const documentTitle = 'Kitaplık';
const label = 'window and document are words here';
export const facts = { views: VIEWS.length, site: SITE_URL, groups: EXCLUSIVE_STATE_GROUPS.length, sibling, documentTitle, label };
