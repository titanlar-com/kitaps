import {publicationUrl,workFormat} from './workFormat.js';
import {SOURCE_URL} from './site.js';

// A missing search result never proves that a translation does not exist.
const TURKISH_ONLY_LETTERS=/[ğĞşŞıİ]/;
const SOURCE_NOTES_URL=`${SOURCE_URL}/blob/main/data/kitaplar.md`;
const text=value=>typeof value==='string'&&value.trim()?value.trim():'';
const names=values=>Array.isArray(values)?values.map(text).filter(Boolean):[];
// Source notes append printings to publishers: "Optimist Yayınları (2008)".
const publisherName=value=>text(value).replace(/\s*\([^)]*\)\s*$/,'');

// The source list marks Turkish-authored editions as "— (telif Türkçe)".
const AUTHORED_IN_TURKISH=/telif/i;

export const isOriginalTurkish=book=>book.verifiedEdition?.originalLanguage==='tr'||book.translationResearch?.status==='original'||(book.editions||[]).some(edition=>AUTHORED_IN_TURKISH.test(edition.translator||''));

/** The source list's best translation: a named translator whose edition the
 * source marked as verified, ordered by the source's own trust score. */
export function sourceNoteEdition(book){
 return [...(book.editions||[])]
  .filter(edition=>text(edition.translator)&&!edition.translator.trim().startsWith('—')&&edition.status?.includes('ok'))
  .sort((left,right)=>(right.trust?.score||0)-(left.trust?.score||0))[0]||null;
}

/** The Turkish edition the catalog presents, strongest evidence first. The
 * book page, the card status and the JSON export all read this one record. */
export function turkishEdition(book){
 const research=book.translationResearch;
 if(research?.status==='available'&&research.edition){
  const source=research.stage1?.sources?.[0];
  return {title:text(research.edition.title),publisher:text(research.edition.publisher),isbn:text(research.edition.isbn),translators:names(research.edition.translators),sourceUrl:source?.url||'',sourceType:source?.type||'',basis:'research'};
 }
 const verified=book.verifiedEdition;
 if(verified)return {title:text(verified.title),publisher:text(verified.publisher),isbn:text(verified.isbn),translators:names(verified.translators),sourceUrl:verified.sourceUrl||'',sourceType:verified.secondSourceUrl?'two-sites':verified.sourceType||'',basis:'verified'};
 const cover=book.cover;
 if(cover?.language==='tr')return {title:text(cover.title),publisher:text(cover.publisher),isbn:text(cover.isbn),translators:[],sourceUrl:cover.sourceUrl||'',sourceType:'',basis:'cover'};
 const note=sourceNoteEdition(book);
 if(note)return {title:text(note.turkish)||text(book.titleTr),publisher:publisherName(note.publisher),isbn:'',translators:[text(note.translator)],sourceUrl:SOURCE_NOTES_URL,sourceType:'source-note',basis:'source-note'};
 return null;
}

/** The translation to recommend. When the presented edition names no
 * translator, the source list's trusted translation is offered instead. */
export function recommendedTranslation(book){
 if(isOriginalTurkish(book))return null;
 const edition=turkishEdition(book);
 if(edition?.translators.length)return {translators:edition.translators,publisher:edition.publisher,basis:edition.basis};
 const note=sourceNoteEdition(book);
 return note?{translators:[text(note.translator)],publisher:publisherName(note.publisher),basis:'source-note'}:null;
}

export function translationStatus(book) {
 const research=book.translationResearch;
 const researchSource=research?.stage1?.sources?.[0]?.url;
 if(isOriginalTurkish(book))return {status:'original',label:'Türkçe eser',description:'Türkçe yazılmış özgün eser. Bu baskı için çevirmen gerekmez.',source:book.verifiedEdition?.sourceUrl||researchSource};
 if(research?.status==='available'&&researchSource)return {status:'available',label:'Türkçe var',description:'Türkçe baskı iki bağımsız araştırma aşamasında doğrulandı. Künye bilgilerini kitap ayrıntısında karşılaştır.',source:researchSource};
 if(research?.status==='unavailable'&&researchSource)return {status:'unavailable',label:'Türkçe yok',description:research.scopeNote,source:researchSource};
 const edition=turkishEdition(book);
 const format=workFormat(book);
 if(format&&!edition)return {status:'unverified',label:'Türkçe belirsiz',description:`${format.label}: Türkçe çevirisi araştırılmadı. Özgün metin yayın bilgisindeki bağlantıda.`,source:publicationUrl(book.publication)};
 if(edition)return {status:'available',label:'Türkçe var',description:edition.basis==='source-note'?'Türkçe baskı, kaynak listesinin doğrulanmış çeviri notunda kayıtlı. Künye bilgilerini kitap ayrıntısında karşılaştır.':'Türkçe baskı kaydı bulundu. Çevirmen ve ISBN bilgilerini kitap ayrıntısında karşılaştır.',source:edition.sourceUrl||book.cover?.sourceUrl};
 return {status:'unverified',label:'Türkçe belirsiz',description:'Türkçe baskı henüz doğrulanamadı. Bu, çevirisi olmadığı anlamına gelmez. Varsa gösterilen kapak uluslararası baskıya aittir.',source:book.cover?.sourceUrl};
}

export function displayTitle(book){
 const status=translationStatus(book).status;
 if(status==='available'||status==='original')return book.titleTr||turkishEdition(book)?.title||book.title;
 if(book.originalTitle)return book.originalTitle;
 // Some imported lists stored a Turkish explanatory title in `title`; the
 // international cover then carries the work's own title.
 if(TURKISH_ONLY_LETTERS.test(book.title||'')&&book.cover?.language&&book.cover.language!=='tr'&&book.cover.title)return book.cover.title;
 return book.title;
}

export function turkishMeaning(book){
 const status=translationStatus(book).status;
 if(status==='available'||status==='original')return '';
 const shown=displayTitle(book);
 if(book.titleTr&&book.titleTr!==shown)return book.titleTr;
 const editionTitle=book.editions?.find(edition=>edition.turkish&&edition.turkish!==shown)?.turkish;
 if(editionTitle)return editionTitle;
 if(book.title&&book.title!==shown)return book.title;
 return '';
}
