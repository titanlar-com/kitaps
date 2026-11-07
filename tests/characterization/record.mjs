// Records the golden files from the code as it is now (ADR 003, phase 0). Run it only when a
// change of behaviour is intended and reviewed, never to make a failing test pass.
//
//   node tests/characterization/record.mjs
import { catalogListing } from '../../src/app/listing.js';
import { characterizeListing, characterizeRanking, characterizeSeo, readFixture, writeGolden } from './oracle.js';

const catalog = readFixture();
const listing = characterizeListing(catalogListing, catalog);
writeGolden('catalog-listing', listing);
writeGolden('reading-ranking', characterizeRanking(catalog));
writeGolden('seo', characterizeSeo(catalogListing, catalog));
console.log(`golden files: ${Object.keys(listing).length} listing queries, ${catalog.books.length} ranked books`);
