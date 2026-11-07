import fs from 'node:fs';
import { checkStateRepository, describeHealth } from '../src/state/health.ts';

// Reads the shared state repository (titanlar-com/kitaps-state) without a key and checks
// state.json and routes.json with the app's own rules. --warn-only reports problems without
// failing, so a GitHub outage never blocks publishing the site. ADR 002, phase 6.
const root=new URL('../',import.meta.url);
const readJSON=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const health=await checkStateRepository({
 bookIds:readJSON('src/catalog.json').books.map(book=>book.id),
 storeIds:readJSON('data/bookstores.json').stores.map(store=>store.id),
});
const {text,exitCode}=describeHealth(health,{github:process.env.GITHUB_ACTIONS==='true',warnOnly:process.argv.includes('--warn-only')});
console.log(text);
process.exitCode=exitCode;
