import React from 'react';
import { Alert,Anchor,Button,Group,Paper,Text,Title } from '@mantine/core';
import { IconShoppingBag,IconPhoto,IconArrowUpRight,IconSchool } from '@tabler/icons-react';
import { recommendedTranslation,translationStatus,turkishEdition } from '../translation';
import { publicationLine,workFormat } from '../workFormat';
import { pageCount } from '../pages';

const EVIDENCE={
 research:'Türkçe baskı iki bağımsız araştırma aşamasında doğrulandı.',
 'two-sites':'ISBN, yayınevi ve çevirmen iki ayrı sitenin künyesiyle kontrol edildi.',
 'publisher':'Yayınevi künyesinden kontrol edildi.',
 'publisher-preview':'Yayınevi önizlemesinden kontrol edildi.',
 bibliographic:'Kütüphane künyesinden kontrol edildi.',
 retailer:'Kitapçı künyesinden kontrol edildi; yayıneviyle ikinci kontrol bekliyor.',
 cover:'Türkçe baskının kapak künyesinden alındı.',
 'source-note':'Kaynak listesindeki doğrulanmış çeviri notundan alındı.',
};

/** An article or essay has no edition to buy: its page says where it appeared
 * and links to the text, or to its DOI record when the text is not free. */
function PublicationSummary({book,format}){
 const p=book.publication;
 const scholar=new URLSearchParams({q:`"${book.originalTitle||book.title}" ${book.author}`});
 return <Paper component="section" withBorder radius="lg" p="lg" className="edition-summary" aria-label="Yayın bilgisi ve metin">
  <Title order={3} mb="md">Yayın bilgisi</Title>
  <dl className="edition-facts">
   <div><dt>Tür</dt><dd>{format.label}</dd></div>
   <div><dt>Yayımlandığı yer</dt><dd>{publicationLine(p)}</dd></div>
   {p.doi&&<div><dt>DOI</dt><dd>{p.doi}</dd></div>}
  </dl>
  <Text c="dimmed" mt="md">{format.label} olduğu için baskı ve çevirmen bilgisi yok. Türkçe çevirisi araştırılmadı.</Text>
  {p.readUrl&&<Anchor href={p.readUrl} target="_blank" rel="noreferrer" className="source-link">Metni oku <IconArrowUpRight size={18}/></Anchor>}
  {p.doi&&<Anchor href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="source-link">DOI kaydını aç <IconArrowUpRight size={18}/></Anchor>}
  {!p.readUrl&&!p.doi&&p.pageUrl&&<Anchor href={p.pageUrl} target="_blank" rel="noreferrer" className="source-link">Yayın sayfasını aç <IconArrowUpRight size={18}/></Anchor>}
  {book.format==='article'&&<Group gap="sm" mt="lg" className="book-shopping-links"><Button component="a" href={`https://scholar.google.com/scholar?${scholar}`} target="_blank" rel="noreferrer" variant="light" leftSection={<IconSchool size={20}/>}>Google Akademik</Button></Group>}
 </Paper>;
}

export default function EditionSummary({book}){
 const format=workFormat(book);
 if(format&&book.publication)return <PublicationSummary book={book} format={format}/>;
 const status=translationStatus(book).status,original=status==='original',known=original||status==='available';
 const edition=known?turkishEdition(book):null,recommended=recommendedTranslation(book),c=book.cover;
 const title=edition?.title||book.title;
 const query=[title,book.author,edition?.publisher,edition?.isbn].filter(Boolean).join(' ');
 const params=new URLSearchParams({q:query});
 const evidence=edition?(edition.basis==='verified'?EVIDENCE[edition.sourceType]||EVIDENCE.retailer:EVIDENCE[edition.basis]):'';
 const otherEdition=recommended&&!edition?.translators.length&&recommended.publisher&&recommended.publisher!==edition?.publisher;
 const pages=pageCount(book);
 return <Paper component="section" withBorder radius="lg" p="lg" className="edition-summary" aria-label="Yayınevi, çevirmen ve kitabı bul">
  <Title order={3} mb="md">{original?'Baskı bilgisi':'Baskı ve çevirmen'}</Title>{book.sourceIssue&&<Alert color="orange" title="Baskı seçerken dikkat" mb="md">{book.sourceIssue.note}</Alert>}
  <dl className="edition-facts">
   <div><dt>Yayınevi</dt><dd>{edition?.publisher||c?.publisher||'Henüz doğrulanmadı'}</dd></div>
   {!original&&<div><dt>Çevirmen</dt><dd>{edition?.translators.length?edition.translators.join(' · '):recommended?`${recommended.translators.join(' · ')}${otherEdition?` (${recommended.publisher})`:''}`:'Henüz doğrulanmadı'}</dd></div>}
   {(edition?.isbn||c?.isbn)&&<div><dt>ISBN</dt><dd>{edition?.isbn||c?.isbn}</dd></div>}
   <div><dt>Sayfa sayısı</dt><dd>{pages?pages.pages:'Henüz doğrulanmadı'}</dd></div>
  </dl>
  {evidence&&<Text className="edition-evidence" mt="md">{evidence}{c&&edition?.isbn&&c.isbn&&edition.isbn!==c.isbn?' Kapak farklı bir baskıya ait.':''}</Text>}
  {pages&&<Text c="dimmed" mt="sm">Sayfa sayısı bu ISBN’in <Anchor href={pages.sourceUrl} target="_blank" rel="noreferrer">{pages.sourceName}</Anchor> kaydından.</Text>}
  {!edition?.translators.length&&recommended?.basis==='source-note'&&<Text c="dimmed" mt="sm">Çevirmen, kaynak listesinin güven puanıyla önerdiği çeviriden alındı.</Text>}
  {status==='unavailable'&&<Text c="dimmed" mt="md">Kaynaklara göre Türkçe baskısı yok.{c?' Gösterilen kapak uluslararası baskıya aittir.':''}</Text>}
  {status==='unverified'&&<Text c="dimmed" mt="md">Türkçe baskı doğrulanamadı.{c?' Gösterilen kapak uluslararası baskıya aittir.':''}</Text>}
  {edition?.sourceUrl&&<Anchor href={edition.sourceUrl} target="_blank" rel="noreferrer" className="source-link">Künye kaynağını aç <IconArrowUpRight size={18}/></Anchor>}
  <Group gap="sm" mt="lg" className="book-shopping-links">
   <Button component="a" href={`https://www.google.com/search?tbm=shop&${params}`} target="_blank" rel="noreferrer" variant="light" leftSection={<IconShoppingBag size={20}/>}>Google Alışveriş</Button>
   <Button component="a" href={`https://www.google.com/search?tbm=isch&${params}`} target="_blank" rel="noreferrer" variant="light" leftSection={<IconPhoto size={20}/>}>Google Görseller</Button>
   {!known&&<Button component="a" href={`https://www.amazon.com/s?${new URLSearchParams({k:[book.originalTitle||book.title,book.author].filter(Boolean).join(' ')})}`} target="_blank" rel="noreferrer" variant="default" rightSection={<IconArrowUpRight size={18}/>}>Özgün baskı · Amazon</Button>}
  </Group>
 </Paper>;
}
