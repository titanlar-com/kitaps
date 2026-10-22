import React, { useEffect, useRef, useState } from 'react';
import { transition } from '../motion';
import { ActionIcon, Button, Drawer, NumberInput, TextInput } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { IconArrowLeft, IconArrowRight, IconBooks, IconCalendar, IconCalendarPlus, IconCheck, IconChevronRight, IconListCheck, IconSearch, IconTags, IconUser, IconWriting } from '@tabler/icons-react';
import { STATE_LABELS, QUALITY_LABELS, ORIGIN_LABELS, formatDay, normalize } from '../library';
import './FilterSheet.css';

const entries = object => Object.entries(object).map(([value, label]) => ({ value, label }));
const toggle = (values, value) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];
const sections = [
 { id: 'categories', title: 'Kategoriler', hint: 'Konusuna göre keşfet', icon: IconTags },
 { id: 'states', title: 'Okuma durumum', hint: 'Favoriler ve okuma kayıtları', icon: IconListCheck },
 { id: 'authors', title: 'Yazarlar', hint: 'Bir yazarın kitaplarını bul', icon: IconUser },
 { id: 'collections', title: 'Kümeler', hint: 'Seçkiler ve okuma rotaları', icon: IconBooks },
 { id: 'editions', title: 'Baskı ve kaynak', hint: 'Künye bilgisi ve kaynaklar', icon: IconWriting },
 { id: 'years', title: 'Yıl ve ödül', hint: 'Yayın aralığı ve FT ödülleri', icon: IconCalendar },
 { id: 'added', title: 'Eklenme tarihi', hint: 'Kitaplığa hangi gün eklendi', icon: IconCalendarPlus },
];

function Choice({ checked, onChange, children }) {
 return <label className="filter-choice" data-checked={checked || undefined}>
  <input type="checkbox" checked={checked} onChange={onChange} />
  <span className="filter-choice-mark" aria-hidden="true">{checked && <IconCheck size={16} stroke={2.5} />}</span>
  <span>{children}</span>
 </label>;
}

function Choices({ title, options, value, onChange, searchable = false, compact = false }) {
 const [query, setQuery] = useState('');
 const searchRef = useRef(null);
 const [limit, setLimit] = useState(12);
 const matches = options.filter(option => normalize(option.label).includes(normalize(query)));
 const visible = searchable ? matches.slice(0, limit) : matches;
 // Keep selected items removable even when the search or result limit hides them.
 const retained = options.filter(option => value.includes(option.value) && !visible.some(v => v.value === option.value));
 const choice = (option, retainedSelection = false) => <Choice key={option.value} checked={value.includes(option.value)} onChange={() => {
  onChange(toggle(value, option.value));
  if (retainedSelection) searchRef.current?.focus({ preventScroll: true });
 }}>{option.label}</Choice>;
 return <fieldset className="filter-fieldset">
  <legend>{title}</legend>
  {searchable && <TextInput ref={searchRef} className="filter-option-search" label={`${title} ara`} placeholder={`${title} ara`} autoComplete="off" autoCorrect="off" spellCheck={false} leftSection={<IconSearch size={19} aria-hidden="true" />} value={query} onChange={e => { setQuery(e.currentTarget.value); setLimit(12); }} />}
  {retained.length > 0 && <div className="filter-retained"><p className="filter-hint">Diğer seçimlerin</p>{retained.map(option => choice(option, true))}</div>}
  <div className={`filter-choices${compact ? ' filter-choices-compact' : ''}`}>{visible.map(option => choice(option))}</div>
  {matches.length === 0 && <p className="filter-hint" role="status">Eşleşme yok. Aramayı kısaltmayı dene.</p>}
  {searchable && matches.length > 12 && <Button className="filter-show-more" variant="subtle" onClick={() => setLimit(limit >= matches.length ? 12 : limit + 12)}>{matches.length > limit ? `Daha fazla göster · ${matches.length - limit}` : 'Daha az göster'}</Button>}
 </fieldset>;
}

export default function FilterSheet({ opened, onClose, value: f, onChange, onReset, onApply, count, catalog, authors, shelf = catalog.books }) {
 const [section, setSection] = useState(null);
 const [viewport, setViewport] = useState(null);
 const titleRef = useRef(null);
 const bodyRef = useRef(null);
 const reducedMotion = useReducedMotion();
 const set = (key, value) => onChange({ ...f, [key]: value });
 const categoryOptions = catalog.categories.map(c => ({ value: c.id, label: c.label }));
 const collectionOptions = catalog.collections.map(c => ({ value: c.id, label: c.short }));
 const groupOptions = catalog.groups.filter(g => !f.collections.length || f.collections.includes(g.collectionId)).map(g => ({ value: g.id, label: `${catalog.collections.find(c => c.id === g.collectionId)?.short} · ${g.title}` }));
 // Each day books entered the library, newest first, with how many of the books in this view arrived that day.
 const addedCounts = shelf.reduce((counts, book) => book.addedAt ? { ...counts, [book.addedAt]: (counts[book.addedAt] || 0) + 1 } : counts, {});
 const addedOptions = Object.keys(addedCounts).sort().reverse().map(day => ({ value: day, label: `${formatDay(day)} · ${addedCounts[day]} kitap` }));
 const labelFor = (options, values) => values.map(v => options.find(o => o.value === v)?.label || v);
 const selected = {
  categories: labelFor(categoryOptions, f.categories), states: f.states.map(s => STATE_LABELS[s]), authors: f.authors,
  collections: [...labelFor(collectionOptions, f.collections), ...f.groups.map(id => catalog.groups.find(g => g.id === id)?.title || id), ...(f.shared ? ['Birden fazla kümede'] : [])],
  editions: [...f.qualities.map(v => QUALITY_LABELS[v]), ...f.origins.map(v => ORIGIN_LABELS[v]), ...(f.hasEdition ? ['Künye bilgisi var'] : [])],
  years: [...f.awards, ...f.awardYears.map(y => `FT ${y}`), ...(f.yearMin !== '' || f.yearMax !== '' ? [`${f.yearMin || '…'}–${f.yearMax || '…'}`] : [])],
  added: f.addedDates.map(formatDay),
 };
 const selectionCount = Object.values(selected).reduce((sum, values) => sum + values.length, 0);
 const invalidYears = f.yearMin !== '' && f.yearMax !== '' && Number(f.yearMin) > Number(f.yearMax);
 const current = sections.find(s => s.id === section);

 useEffect(() => { if (!opened) setSection(null); }, [opened]);
 useEffect(() => {
  if (!opened) return;
  titleRef.current?.focus({ preventScroll: true });
  bodyRef.current?.scrollTo({ top: 0, behavior: 'instant' });
 }, [opened, section]);
 useEffect(() => {
  if (!opened || !window.visualViewport) return;
  const visual = window.visualViewport;
  const resize = () => {
   if (visual.scale !== 1) return;
   setViewport({ height: visual.height, top: visual.offsetTop, panelHeight: Math.min(window.innerHeight * .9, visual.height) });
  };
  resize();
  visual.addEventListener('resize', resize);
  visual.addEventListener('scroll', resize);
  return () => { visual.removeEventListener('resize', resize); visual.removeEventListener('scroll', resize); };
 }, [opened]);

 return <Drawer.Root opened={opened} onClose={onClose} position="bottom" size="90dvh" className="filter-sheet" padding={0} transitionProps={transition(reducedMotion)} styles={viewport ? { inner: { height: viewport.height, top: viewport.top, bottom: 'auto' }, content: { height: viewport.panelHeight } } : undefined}>
  <Drawer.Overlay backgroundOpacity={.45} blur={3} />
  <Drawer.Content aria-describedby="filter-sheet-description">
   <Drawer.Header>
    {section && <ActionIcon variant="subtle" aria-label="Filtre başlıklarına dön" onClick={() => setSection(null)}><IconArrowLeft size={22} /></ActionIcon>}
    <Drawer.Title ref={titleRef} tabIndex={-1} data-autofocus>{current?.title || 'Filtreler'}</Drawer.Title>
    <Drawer.CloseButton aria-label="Filtreleri uygulamadan kapat" />
   </Drawer.Header>
   <Drawer.Body ref={bodyRef}>
    <p className="filter-hint filter-intro" id="filter-sheet-description">{section ? 'Birden fazla seçim yapabilirsin.' : 'Aradığın kitapları daralt.'}</p>
    {f.query && <p className="filter-query">Araman: <strong>{f.query}</strong></p>}
    {!section && <nav className="filter-sections" aria-label="Filtre başlıkları">{sections.map(({ id, title, hint, icon: Icon }) => <button type="button" className="filter-section-link" key={id} aria-label={selected[id].length ? `${title}: ${selected[id].join(", ")}. ${selected[id].length} seçim` : undefined} onClick={() => setSection(id)}>
     <span className="filter-section-icon" aria-hidden="true"><Icon size={22} stroke={1.6} /></span>
     <span className="filter-section-copy"><strong>{title}</strong><span data-selected={selected[id].length > 0 || undefined}>{selected[id].length ? selected[id][0] : hint}</span></span>
     {selected[id].length > 0 && <span className="filter-section-count" aria-label={`${selected[id].length} seçim`}>{selected[id].length}</span>}
     <IconChevronRight className="filter-section-arrow" size={18} aria-hidden="true" />
    </button>)}</nav>}
    <div className="filter-section-content" key={section}>
     {section === 'categories' && <>
      <Choices title="Kategoriler" options={categoryOptions} value={f.categories} onChange={v => set('categories', v)} />
      {f.categories.length > 1 && <Choice checked={f.categoryMode === 'all'} onChange={() => set('categoryMode', f.categoryMode === 'all' ? 'any' : 'all')}>Seçili kategorilerin tümü eşleşsin</Choice>}
     </>}
     {section === 'states' && <Choices title="Okuma durumum" options={entries(STATE_LABELS)} value={f.states} onChange={v => set('states', v)} />}
     {section === 'authors' && <Choices title="Yazar" options={authors.map(a => ({ value: a, label: a }))} value={f.authors} onChange={v => set('authors', v)} searchable />}
     {section === 'collections' && <>
      <Choices title="Kitap kümesi" options={collectionOptions} value={f.collections} onChange={v => onChange({ ...f, collections: v, groups: f.groups.filter(id => !v.length || v.includes(catalog.groups.find(g => g.id === id)?.collectionId)) })} searchable />
      {f.collections.length > 1 && <Choice checked={f.collectionMode === 'all'} onChange={() => set('collectionMode', f.collectionMode === 'all' ? 'any' : 'all')}>Seçili kümelerin tümünde bulunsun</Choice>}
      <Choices title="Alt küme" options={groupOptions} value={f.groups} onChange={v => set('groups', v)} searchable />
      <Choice checked={f.shared} onChange={() => set('shared', !f.shared)}>Birden fazla kitap kümesinde bulunanlar</Choice>
     </>}
     {section === 'editions' && <>
      <Choices title="Kaynağın künye değerlendirmesi" options={entries(QUALITY_LABELS)} value={f.qualities} onChange={v => set('qualities', v)} />
      <Choice checked={f.hasEdition} onChange={() => set('hasEdition', !f.hasEdition)}>Çevirmen veya yayınevi bilgisi bulunanlar</Choice>
      <Choices title="Verinin kaynağı" options={entries(ORIGIN_LABELS)} value={f.origins} onChange={v => set('origins', v)} />
      <p className="filter-hint">Künye değerlendirmeleri özgün kaynaktan aktarılır; çevirinin kalitesini tek başına ölçmez.</p>
     </>}
     {section === 'years' && <>
      <fieldset className="filter-fieldset"><legend>İlk yayın yılı</legend><div className="filter-year-range">
       <NumberInput label="En erken" placeholder="Sınır yok" value={f.yearMin} onChange={v => set('yearMin', v)} min={-3000} max={2100} allowDecimal={false} hideControls autoComplete="off" />
       <NumberInput label="En geç" placeholder="Sınır yok" value={f.yearMax} onChange={v => set('yearMax', v)} min={-3000} max={2100} allowDecimal={false} hideControls autoComplete="off" aria-invalid={invalidYears || undefined} aria-describedby={invalidYears ? 'filter-year-error' : undefined} />
      </div>{invalidYears && <p id="filter-year-error" className="filter-error" data-edge="start" role="alert">En geç yıl, en erken yıldan küçük olamaz.</p>}<p className="filter-hint">Aralık seçildiğinde yayın yılı bilinmeyen kitaplar gösterilmez.</p></fieldset>
      <Choices title="FT ödülü" options={['Kazanan', 'Kısa liste', 'Uzun liste'].map(value => ({ value, label: value }))} value={f.awards} onChange={v => set('awards', v)} />
      <Choices title="FT ödül yılı" options={Array.from({ length: 22 }, (_, i) => ({ value: String(2026 - i), label: String(2026 - i) }))} value={f.awardYears} onChange={v => set('awardYears', v)} compact />
     </>}
     {section === 'added' && <>
      <Choices title="Kitaplığa eklendiği gün" options={addedOptions} value={f.addedDates} onChange={v => set('addedDates', v)} />
      <p className="filter-hint">Tarihler, kitabın kitaplık verisine girdiği ilk commit’ten çıkarıldı.</p>
     </>}
    </div>
   </Drawer.Body>
   <footer className="filter-sheet-footer">
    <p className="filter-result" role="status" aria-live="polite" aria-atomic="true"><span className="filter-result-total">{invalidYears ? 'Yıl aralığını düzelt' : <><strong>{count}</strong> kitap eşleşiyor</>}</span>{selectionCount > 0 && <span className="filter-result-selection">{selectionCount} seçim</span>}</p>
    <div className="filter-footer-actions"><Button variant="subtle" disabled={!selectionCount} onClick={onReset}>Temizle</Button><Button disabled={invalidYears} onClick={onApply} rightSection={<IconArrowRight size={19} aria-hidden="true" />}>Kitapları göster</Button></div>
   </footer>
  </Drawer.Content>
 </Drawer.Root>;
}
