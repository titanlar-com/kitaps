import React, { useEffect, useId, useRef, useState } from 'react';
import { transition } from '../motion';
import { ActionIcon, Badge, Button, Drawer, NumberInput, TextInput } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { IconArrowLeft, IconArrowRight, IconBooks, IconCalendar, IconCalendarPlus, IconCheck, IconChevronRight, IconListCheck, IconSearch, IconTags, IconUser, IconWriting } from '@tabler/icons-react';
import { QUALITY_LABELS, ORIGIN_LABELS, formatDay } from '../library';
import { CHOICE_STEP, choicesScreen, filtersScreen } from '../screens/filters.js';
import './FilterSheet.css';

const toggle = (values, value) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];
const SECTION_ICONS = { categories: IconTags, authors: IconUser, collections: IconBooks, states: IconListCheck, editions: IconWriting, years: IconCalendar, added: IconCalendarPlus };

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
 const [limit, setLimit] = useState(CHOICE_STEP);
 const model = choicesScreen({ title, options, value, query, limit, searchable });
 const choice = (option, retainedSelection = false) => <Choice key={option.value} checked={value.includes(option.value)} onChange={() => {
  onChange(toggle(value, option.value));
  if (retainedSelection) searchRef.current?.focus({ preventScroll: true });
 }}>{option.label}</Choice>;
 return <fieldset className="filter-fieldset">
  <legend><span>{model.title}</span><span className="filter-legend-count">{model.count}</span></legend>
  {model.search && <TextInput ref={searchRef} className="filter-option-search" label={model.search.label} placeholder={model.search.placeholder} autoComplete="off" autoCorrect="off" spellCheck={false} leftSection={<IconSearch size={19} aria-hidden="true" />} value={query} onChange={e => { setQuery(e.currentTarget.value); setLimit(CHOICE_STEP); }} />}
  {model.retained && <div className="filter-retained"><p className="filter-hint">{model.retained.hint}</p>{model.retained.options.map(option => choice(option, true))}</div>}
  <div className={`filter-choices${compact ? ' filter-choices-compact' : ''}`}>{model.visible.map(option => choice(option))}</div>
  {model.noMatch && <p className="filter-hint" role="status">{model.noMatch}</p>}
  {model.more && <Button className="filter-show-more" variant="subtle" onClick={() => setLimit(model.more.limit)}>{model.more.text}</Button>}
 </fieldset>;
}

export default function FilterSheet({ opened, covered = false, onClose, onExited, value: f, onChange, onReset, onApply, count, catalog, authors, shelf = catalog.books }) {
 const [section, setSection] = useState(null);
 const leftSection = useRef(null);
 const [viewport, setViewport] = useState(null);
 const titleRef = useRef(null);
 const bodyRef = useRef(null);
 const reducedMotion = useReducedMotion();
 const headingBase = useId();
 const set = (key, value) => onChange({ ...f, [key]: value });
 const model = filtersScreen({ filters: f, section, count, catalog, authors, shelf, qualityLabels: QUALITY_LABELS, originLabels: ORIGIN_LABELS, formatDay });
 const { categories, states, authors: authorList, collections, editions, years, added } = model.content;

 // The section stays on screen while the sheet leaves; opened again, it starts from the list (ADR 004, K6).
 useEffect(() => { if (opened) setSection(null); }, [opened]);
 useEffect(() => {
  if (!opened) return;
  const left = leftSection.current;
  leftSection.current = null;
  // Back from a section the reader lands on the heading they opened, not at the top of the sheet.
  const heading = !section && left ? bodyRef.current?.querySelector(`[data-section="${left}"]`) : null;
  if (heading) heading.focus({ preventScroll: false });
  else { titleRef.current?.focus({ preventScroll: true }); bodyRef.current?.scrollTo({ top: 0, behavior: 'instant' }); }
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

 return <Drawer.Root opened={opened} onClose={onClose} closeOnEscape={!covered} onExitTransitionEnd={() => { setSection(null); onExited?.(); }} position="bottom" size="90dvh" className="filter-sheet" padding={0} transitionProps={transition('sheet',reducedMotion)} styles={viewport ? { inner: { height: viewport.height, top: viewport.top, bottom: 'auto' }, content: { height: viewport.panelHeight } } : undefined}>
  <Drawer.Overlay backgroundOpacity={.45} blur={3} />
  <Drawer.Content aria-describedby="filter-sheet-description">
   <Drawer.Header>
    {model.header.back && <ActionIcon variant="subtle" aria-label={model.header.back} onClick={() => { leftSection.current = section; setSection(null); }}><IconArrowLeft size={22} /></ActionIcon>}
    <Drawer.Title ref={titleRef} tabIndex={-1} data-autofocus>{model.header.title}</Drawer.Title>
    <Drawer.CloseButton aria-label={model.header.close} />
   </Drawer.Header>
   <Drawer.Body ref={bodyRef}>
    <p className="filter-hint filter-intro" id="filter-sheet-description">{model.header.intro}</p>
    {model.query && <p className="filter-query">{model.query.label} <strong>{model.query.value}</strong></p>}
    {!section && <nav className="filter-groups" aria-label={model.nav}>{model.groups.map(group => <div className="filter-group" role="group" aria-labelledby={`${headingBase}-${group.id}`} key={group.id}>
     <div className="filter-group-heading"><span className="filter-group-title" id={`${headingBase}-${group.id}`}>{group.title}</span>{group.chosen && <span className="filter-group-count">{group.chosen}</span>}</div>
     <div className="filter-sections">{group.sections.map(row => {
      const Icon = SECTION_ICONS[row.id];
      return <button type="button" className="filter-section-link" data-section={row.id} key={row.id} aria-label={row.label} onClick={() => setSection(row.id)}>
       <span className="filter-section-icon" aria-hidden="true"><Icon size={22} stroke={1.6} /></span>
       <span className="filter-section-copy"><strong>{row.title}</strong><span data-selected={row.chosen || undefined}>{row.detail}</span></span>
       {row.chosen && <Badge className="filter-section-count" variant="light">{row.count}</Badge>}
       <IconChevronRight className="filter-section-arrow" size={18} aria-hidden="true" />
      </button>;
     })}</div>
    </div>)}</nav>}
    <div className="filter-section-content" key={section}>
     {section === 'categories' && <>
      <Choices title={categories.choices.title} options={categories.choices.options} value={f.categories} onChange={v => set('categories', v)} />
      {categories.allMatch && <Choice checked={categories.allMatch.checked} onChange={() => set('categoryMode', f.categoryMode === 'all' ? 'any' : 'all')}>{categories.allMatch.text}</Choice>}
     </>}
     {section === 'states' && <Choices title={states.choices.title} options={states.choices.options} value={f.states} onChange={v => set('states', v)} />}
     {section === 'authors' && <Choices title={authorList.choices.title} options={authorList.choices.options} value={f.authors} onChange={v => set('authors', v)} searchable />}
     {section === 'collections' && <>
      <Choices title={collections.collections.title} options={collections.collections.options} value={f.collections} onChange={v => onChange({ ...f, collections: v, groups: f.groups.filter(id => !v.length || v.includes(catalog.groups.find(g => g.id === id)?.collectionId)) })} searchable />
      {collections.allMatch && <Choice checked={collections.allMatch.checked} onChange={() => set('collectionMode', f.collectionMode === 'all' ? 'any' : 'all')}>{collections.allMatch.text}</Choice>}
      <Choices title={collections.groups.title} options={collections.groups.options} value={f.groups} onChange={v => set('groups', v)} searchable />
      <Choice checked={collections.shared.checked} onChange={() => set('shared', !f.shared)}>{collections.shared.text}</Choice>
     </>}
     {section === 'editions' && <>
      <Choices title={editions.qualities.title} options={editions.qualities.options} value={f.qualities} onChange={v => set('qualities', v)} />
      <Choice checked={editions.hasEdition.checked} onChange={() => set('hasEdition', !f.hasEdition)}>{editions.hasEdition.text}</Choice>
      <Choices title={editions.origins.title} options={editions.origins.options} value={f.origins} onChange={v => set('origins', v)} />
      <p className="filter-hint">{editions.hint}</p>
     </>}
     {section === 'years' && <>
      <fieldset className="filter-fieldset"><legend>{years.range.legend}</legend><div className="filter-year-range">
       <NumberInput label={years.range.from} placeholder={years.range.none} value={f.yearMin} onChange={v => set('yearMin', v)} min={-3000} max={2100} allowDecimal={false} hideControls autoComplete="off" />
       <NumberInput label={years.range.to} placeholder={years.range.none} value={f.yearMax} onChange={v => set('yearMax', v)} min={-3000} max={2100} allowDecimal={false} hideControls autoComplete="off" aria-invalid={years.range.invalid ? true : undefined} aria-describedby={years.range.invalid ? 'filter-year-error' : undefined} />
      </div>{years.range.invalid && <p id="filter-year-error" className="filter-error" data-edge="start" role="alert">{years.range.invalid}</p>}<p className="filter-hint">{years.range.hint}</p></fieldset>
      <Choices title={years.awards.title} options={years.awards.options} value={f.awards} onChange={v => set('awards', v)} />
      <Choices title={years.awardYears.title} options={years.awardYears.options} value={f.awardYears} onChange={v => set('awardYears', v)} compact />
     </>}
     {section === 'added' && <>
      <Choices title={added.choices.title} options={added.choices.options} value={f.addedDates} onChange={v => set('addedDates', v)} />
      <p className="filter-hint">{added.hint}</p>
     </>}
    </div>
   </Drawer.Body>
   <footer className="filter-sheet-footer">
    <p className="filter-result" role="status" aria-live="polite" aria-atomic="true"><span className="filter-result-total">{model.result.fix || <><strong>{model.result.count}</strong> {model.result.unit}</>}</span>{model.result.selection && <span className="filter-result-selection">{model.result.selection}</span>}</p>
    <div className="filter-footer-actions"><Button variant="subtle" disabled={model.footer.clear.disabled} onClick={onReset}>{model.footer.clear.text}</Button><Button disabled={model.footer.apply.disabled} onClick={onApply} rightSection={<IconArrowRight size={19} aria-hidden="true" />}>{model.footer.apply.text}</Button></div>
   </footer>
  </Drawer.Content>
 </Drawer.Root>;
}
