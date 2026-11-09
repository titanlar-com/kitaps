// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).


// A little girl in the Phosphor style (owner's request, 8 November 2026). Phosphor has no girl, so
// she is drawn on its 256 grid with its 16-unit line: a head, a dress and two legs.
export function GirlIcon({size=28}) {
 return <svg width={size} height={size} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="128" cy="56" r="32"/><path d="M104 112h48l40 96H64Z"/><path d="M104 208v24M152 208v24"/></svg>;
}
export function BookshelfIcon({size=28}) {
 return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 23.5h21M5 4.5h5v16H5zM11.5 6.5h4.5v14h-4.5zM18 5.5l4-1 3.5 15.5-4 1z"/><path d="M3.5 21h21v3H3.5z"/></svg>;
}

// The brand mark: one open book, drawn with two strokes (owner's request, 7 November 2026).
export function BrandMark({size=24}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 6.6C10.1 5.2 7.4 4.5 3.8 4.5v13.2c3.6 0 6.3.7 8.2 2.1 1.9-1.4 4.6-2.1 8.2-2.1V4.5c-3.6 0-6.3.7-8.2 2.1z"/><path d="M12 6.6v13.2"/></svg>;
}
