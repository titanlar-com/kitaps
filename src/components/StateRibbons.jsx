import React from 'react';
import { stateMarksScreen } from '../screens/book.js';

/** Ribbons drawn on the cover. They are decoration for sighted readers;
 * StateSummary says the same thing after the title, where a screen reader
 * moving through the card expects it. */
export default function StateRibbons({ marks = [] }) {
 const { ribbons } = stateMarksScreen(marks);
 if (!ribbons.length) return null;
 return <span className="state-ribbons" aria-hidden="true">
  {ribbons.map(({ state, label }) => <span key={state} className="state-ribbon" data-state={state}>{label}</span>)}
 </span>;
}

export function StateSummary({ marks = [] }) {
 const { summary } = stateMarksScreen(marks);
 if (!summary) return null;
 return <span className="visually-hidden">{summary}</span>;
}
