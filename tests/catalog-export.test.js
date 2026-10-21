import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../src/catalog.json' with {type:'json'};
import {createBooksExport,exportBookRecord} from '../src/catalogExport.js';
import {splitAuthors} from '../src/authors.js';
import {displayTitle,translationStatus} from '../src/translation.js';

const byId=Object.fromEntries(catalog.books.map(book=>[book.id,book]));
const TURKISH_ONLY=/[ğĞşŞıİ]/;

test('catalog export contains every book with the requested bibliographic fields plus join keys',()=>{
 const result=createBooksExport(catalog,'2026-09-28T12:00:00.000Z');
 assert.equal(result.schemaVersion,3);
 assert.equal(result.count,catalog.books.length);
 assert.deepEqual(Object.keys(result.books[0]),['id','turkceAdi','orijinalAdi','orijinalYayinevi','orijinalYazarlar','onerilenCevirmenler','turkiyeYayinevi','turkceIsbn','ilkYayinYili','kitapligaEklenme']);
 assert.deepEqual(result.books.map(book=>book.id),catalog.books.map(book=>book.id));
 assert.ok(result.books.every(book=>Array.isArray(book.orijinalYazarlar)&&Array.isArray(book.onerilenCevirmenler)));
 assert.doesNotMatch(JSON.stringify(result),/"searchText"/);
});

test('verified Turkish edition supplies its title, translators, publisher and ISBN',()=>{
 assert.deepEqual(exportBookRecord(byId.competitivestrategy),{
  id:'competitivestrategy',
  turkceAdi:'Rekabet Stratejisi',
  orijinalAdi:'Competitive Strategy',
  // Two-stage bibliographic research names the first publisher.
  orijinalYayinevi:'Free Press',
  orijinalYazarlar:['Michael E. Porter'],
  onerilenCevirmenler:['Gülen Ulubilgen'],
  turkiyeYayinevi:'Aura Kitapları',
  turkceIsbn:byId.competitivestrategy.verifiedEdition.isbn,
  ilkYayinYili:1980,
  // First listed on the original Kitaps site.
  kitapligaEklenme:'2026-09-02',
 });
});

test('an international record without a verified translation keeps Turkish edition fields empty',()=>{
 assert.deepEqual(exportBookRecord(byId.ageofunreason),{
  id:'ageofunreason',
  turkceAdi:null,
  orijinalAdi:'The Age of Unreason',
  // The researched first publisher outranks the publisher of the cover edition.
  orijinalYayinevi:'Business Books Ltd',
  orijinalYazarlar:['Charles Handy'],
  onerilenCevirmenler:[],
  turkiyeYayinevi:null,
  turkceIsbn:null,
  ilkYayinYili:1989,
  kitapligaEklenme:'2026-09-26',
 });
});

test('a translated work never reports its Turkish title as the original title',()=>{
 for(const book of catalog.books){
  const record=exportBookRecord(book);
  if(translationStatus(book).status!=='available'||!record.orijinalAdi)continue;
  assert.ok(!(record.orijinalAdi===record.turkceAdi&&TURKISH_ONLY.test(record.orijinalAdi)),book.id);
 }
 assert.equal(exportBookRecord(byId.kucukprens).orijinalAdi,'Le Petit Prince','researched original title');
 const unresearched=catalog.books.find(book=>translationStatus(book).status==='available'&&!book.originalTitle&&book.titleTr);
 if(unresearched)assert.equal(exportBookRecord(unresearched).orijinalAdi,null,`${unresearched.id}: unknown until researched`);
});

test('the export uses the same edition and translator rules as the book page',()=>{
 for(const book of catalog.books){
  const record=exportBookRecord(book);
  const status=translationStatus(book).status;
  if(status==='available')assert.equal(record.turkceAdi,displayTitle(book),book.id);
  else if(status!=='original')assert.equal(record.turkceAdi,null,book.id);
 }
 assert.deepEqual(exportBookRecord(byId.oncompetition).onerilenCevirmenler,['Kıvanç Tanrıyar']);
 // The two-stage research (ISBN 9786055655433) names the publisher as its imprint does.
 assert.equal(exportBookRecord(byId.oncompetition).turkiyeYayinevi,'Optimist Kitap');
});

test('authors split into people without losing suffixes or shared surnames',()=>{
 assert.deepEqual(splitAuthors('Chip and Dan Heath'),['Chip Heath','Dan Heath']);
 assert.deepEqual(splitAuthors('Thomas J. Peters and Robert H. Waterman, Jr.'),['Thomas J. Peters','Robert H. Waterman Jr.']);
 assert.deepEqual(splitAuthors('Joseph L. Badaracco, Jr.'),['Joseph L. Badaracco Jr.']);
 assert.deepEqual(splitAuthors('Emrah Özdemir, Ali Bilgin Varlık'),['Emrah Özdemir','Ali Bilgin Varlık']);
 assert.deepEqual(splitAuthors('Peter Thiel with Blake Masters'),['Peter Thiel','Blake Masters']);
 assert.deepEqual(splitAuthors('Kautilya'),['Kautilya']);
 assert.deepEqual(splitAuthors(''),[]);
});
