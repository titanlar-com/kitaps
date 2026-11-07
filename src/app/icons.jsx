// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).


export function GirlIcon({size=28}) {
 return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="14" cy="7.8" r="3.4"/><circle cx="8.9" cy="8.6" r="1.6"/><circle cx="19.1" cy="8.6" r="1.6"/><path d="M14 12.4 9.3 21h9.4z"/><path d="M11.8 15 9 17.4M16.2 15l2.8 2.4M12.3 21v3.6M15.7 21v3.6"/></svg>;
}
export function BookshelfIcon({size=28}) {
 return <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 23.5h21M5 4.5h5v16H5zM11.5 6.5h4.5v14h-4.5zM18 5.5l4-1 3.5 15.5-4 1z"/><path d="M3.5 21h21v3H3.5z"/></svg>;
}

// The brand mark: one open book, drawn with two strokes (owner's request, 7 November 2026).
export function BrandMark({size=24}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 6.6C10.1 5.2 7.4 4.5 3.8 4.5v13.2c3.6 0 6.3.7 8.2 2.1 1.9-1.4 4.6-2.1 8.2-2.1V4.5c-3.6 0-6.3.7-8.2 2.1z"/><path d="M12 6.6v13.2"/></svg>;
}
