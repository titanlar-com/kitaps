import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const catalog=read('../src/catalog.json');
const dates=read('../data/added-dates.json');
const shelf=read('../data/shelf-review.json');
const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
// The owner shows some days as one; the records keep the real day.
const moves=Object.fromEntries(read('../data/added-date-overrides.json').moves.map(move=>[move.from,move.to]));
const shown=day=>moves[day]||day;

test('every book carries the day it entered the library, as recorded with its evidence',()=>{
 for(const book of catalog.books){
  const record=dates.records[book.id];
  assert.ok(record,`${book.id}: run scripts/infer-added-dates.py --write, then merge again`);
  assert.match(book.addedAt,/^\d{4}-\d{2}-\d{2}$/,book.id);
  assert.equal(book.addedAt,shown(record.date),book.id);
  assert.ok(['kitaps','kitap-atlasi','kitaplik'].includes(record.repository),book.id);
  // Only a book not yet committed lacks a commit; every other date names one.
  assert.equal(record.commit===null,record.matchedBy==='working-tree',book.id);
  // A date from the first Kitaps site belongs only to a book that came from it.
  if(record.repository==='kitaps')assert.ok(book.origins.includes('kitaps'),book.id);
 }
});

test('added dates follow the library\'s history: Kitaps, then Kitap Atlası, then this catalog',()=>{
 assert.equal(byId[catalog.mapping['kitaps:A1']].addedAt,'2026-09-02');
 assert.equal(byId.competitivestrategy.addedAt,'2026-09-02');
 assert.equal(byId.ageofunreason.addedAt,'2026-09-26');
 // Atlas book "12" must not borrow the date of first-Kitaps records numbered 12 in other sections.
 assert.equal(byId['12'].addedAt,'2026-09-26');
 assert.equal(byId[catalog.mapping['children:pitircik']].addedAt,'2026-09-28');
 assert.equal(catalog.books.map(book=>book.addedAt).sort()[0],'2026-09-02');
 // Each shelf review's new books arrive together on the day it was checked (4 and
 // 21 October 2026); books already in the catalog keep their earlier day.
 for(const item of shelf.books){
  const book=byId[catalog.mapping[`shelf:${item.key}`]];
  const day=item.edition?.checkedAt||shelf.checkedAt;
  if(item.existingId)assert.ok(book.addedAt<'2026-10-04',item.key);
  else assert.equal(book.addedAt,shown(day),item.key);
 }
 assert.deepEqual([...new Set(shelf.books.filter(item=>!item.existingId).map(item=>item.edition?.checkedAt||shelf.checkedAt))].sort(),['2026-10-04','2026-10-21']);
});

test('the owner\'s merged days show as one, while the records keep the real day',()=>{
 for(const [from,to] of Object.entries(moves)){
  assert.ok(Object.values(dates.records).some(record=>record.date===from),`${from} has recorded books`);
  assert.ok(!catalog.books.some(book=>book.addedAt===from),`${from} is shown as ${to}`);
 }
});
