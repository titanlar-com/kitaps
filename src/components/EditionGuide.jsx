import React from 'react';
import { Accordion, Alert, Anchor, Badge, Paper, Stack, Text, Title } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { isOriginalTurkish } from '../translation';
import { formatDay } from '../library';
import { workFormat } from '../workFormat';

export default function EditionGuide({book}) {
 const e=book.verifiedEdition;
 // Translations are chosen among book editions; an article or essay has none here.
 if(isOriginalTurkish(book)||workFormat(book))return null;
 const publisherVerified=e&&['publisher','publisher-preview'].includes(e.sourceType);
 const twoSites=Boolean(e?.secondSourceUrl);
 const sameCover=e&&book.cover?.isbn===e.isbn;
 return <section className="edition-guide" aria-label="Çeviri ve baskı seçimi">
  <Title order={3} mb="md">Hangi çeviriyi okumalıyım?</Title>
  <Accordion variant="separated"><Accordion.Item value="edition"><Accordion.Control>Baskının kaynakları ve kontrol notları</Accordion.Control><Accordion.Panel>{e?<Paper withBorder p="lg" radius="lg">
   <Badge color={publisherVerified||twoSites?'brand':'orange'}>{publisherVerified?'Yayınevi künyesi kontrol edildi':e.sourceType==='bibliographic'?'Kütüphane künyesi kontrol edildi':twoSites?'İki sitenin künyesiyle kontrol edildi':'Kitapçı künyesi · ikinci kontrol bekliyor'}</Badge>
   <Title order={4} mt="md">{e.translators.length?e.translators.join(' · '):'Çevirmen henüz doğrulanmadı'}</Title>
   <Text mt="sm">{e.title} · {e.publisher}</Text>{e.isbn&&<Text c="dimmed" mt="xs">ISBN {e.isbn}</Text>}
   {e.translationEditors&&<Text mt="sm">Çeviri editörleri: {e.translationEditors.join(' · ')}</Text>}
   {e.editors&&<Text mt="sm">Editör: {e.editors.join(' · ')}</Text>}
   {e.sourceLanguage&&<Text mt="sm">Çeviri dili: {e.sourceLanguage}</Text>}
   <Text c="dimmed" mt="sm">{sameCover?'Gösterilen kapak bu ISBN’ye ait.':book.cover?'Gösterilen kapak farklı bir baskıya ait; bu künye o kapağın çevirmenini doğrulamaz.':'Bu baskının kapağı henüz eklenmedi.'}</Text>
   {e.correction&&<Alert mt="md" color="orange" title="Künye düzeltildi">{e.correction}</Alert>}
   {e.note&&<Text mt="md">{e.note}</Text>}
   <Anchor className="source-link" href={e.sourceUrl} target="_blank" rel="noreferrer">{publisherVerified?'Yayınevi kaynağını incele':e.sourceType==='bibliographic'?'Kütüphane kaynağını incele':'Kitapçı kaynağını incele'} <IconArrowUpRight size={18}/></Anchor>
   {twoSites&&<Anchor className="source-link" href={e.secondSourceUrl} target="_blank" rel="noreferrer">İkinci kaynağı incele <IconArrowUpRight size={18}/></Anchor>}
   {e.previewUrl&&<Anchor className="source-link" href={e.previewUrl} target="_blank" rel="noreferrer">Örnek metni aç <IconArrowUpRight size={18}/></Anchor>}
   <Text c="dimmed" mt="sm">Kontrol: {formatDay(e.checkedAt)||'28 Eylül 2026'}. Künye kontrolü çevirinin edebî veya teknik kalitesini tek başına kanıtlamaz; karşılaştırmalı metin incelemesi yapılmadı.</Text>
  </Paper>:<Paper withBorder p="lg" radius="lg"><Badge color="gray">Çevirmen henüz doğrulanmadı</Badge><Text mt="md">Bu eser için Türkçe baskı, ISBN ve çevirmen eşleştirmesi tamamlanmadı. Çeviri bir baskı seçeceksen yayınevinin künyesini ve örnek sayfalarını kontrol et.</Text>{book.cover&&<Anchor className="source-link" href={book.cover.sourceUrl} target="_blank" rel="noreferrer">Kapaktaki baskının sayfasını aç <IconArrowUpRight size={18}/></Anchor>}</Paper>}</Accordion.Panel></Accordion.Item></Accordion>
  {book.editions.length>0&&<Accordion variant="separated" mt="md"><Accordion.Item value="archive"><Accordion.Control>Arşivdeki çeviri ve baskı notları · {book.editions.length}</Accordion.Control><Accordion.Panel><Text c="dimmed" mb="md">Aşağıdakiler önceki Kitaps kaynağının notlarıdır. İsimler ve değerlendirmeler bu alanda bağımsız olarak doğrulanmış sayılmaz. Yukarıdaki ISBN’ye bağlı düzeltmeler önceliklidir.</Text><Stack gap="md">{book.editions.map((old,i)=><Paper withBorder p="md" key={i}><Text fw={600}>{old.translator||'Çevirmen belirtilmemiş'}</Text><Text>{old.publisher||'Yayınevi belirtilmemiş'}</Text>{old.note&&<Text mt="sm">{old.note}</Text>}{old.alt&&<Text mt="sm">Arşivdeki diğer seçenek: {old.alt.name}{old.alt.publisher?` · ${old.alt.publisher}`:''}</Text>}</Paper>)}</Stack></Accordion.Panel></Accordion.Item></Accordion>}
 </section>;
}
