import React from 'react';
import { Badge, Card, Text, Title } from '@mantine/core';
import { noteTable } from '../screens/notes.js';

/** @typedef {React.ReactElement<{children?: React.ReactNode}>} MarkdownElement */
/** @param {React.ReactNode} children @returns {MarkdownElement[]} */
const elements = children => /** @type {MarkdownElement[]} */(React.Children.toArray(children).filter(React.isValidElement));
/** @param {React.ReactNode} children @returns {string} */
const textOf = children => React.Children.toArray(children).map(child=>React.isValidElement(child)?textOf(/** @type {MarkdownElement} */(child).props.children):String(child)).join('');

/** Render every Markdown table cell as a labelled field, preserving inline markup. */
export default function NoteCards({children}) {
 const parts=elements(children);
 const head=parts.find(part=>part.type==='thead');
 const body=parts.find(part=>part.type==='tbody');
 const headings=elements(elements(head?.props.children)[0]?.props.children).map(cell=>cell.props.children);
 const table=noteTable(headings.map(textOf));
 const {idIndex}=table;
 const rows=elements(body?.props.children);
 return <div className="note-cards">{rows.map((row,rowIndex)=>{
  const cells=elements(row.props.children).map(cell=>cell.props.children);
  const primary=table.titleColumn(textOf(cells[table.first]));
  const title=cells[primary];
  return <Card component="article" withBorder radius="lg" padding="lg" className="note-record" key={rowIndex}>
   <div className="note-record-heading">{idIndex>=0&&<Badge variant="light" color="brand">{cells[idIndex]}</Badge>}<div><Text className="note-field-label">{headings[primary]}</Text><Title order={4}>{title}</Title></div></div>
   <dl className="note-fields">{cells.map((content,index)=>{
    if(index===primary||index===idIndex)return null;
    return <div className={table.isWide(index)?'note-field note-field-wide':'note-field'} key={index}><dt>{headings[index]||table.fallbackLabel}</dt><dd>{content}</dd></div>;
   })}</dl>
  </Card>;
 })}</div>;
}
