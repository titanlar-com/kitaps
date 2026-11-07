// Screen classes the layout and the JavaScript share (docs/UI-REDESIGN.md). A phone held sideways
// is still a phone: its short side is at most 31em and its long side under 65em, the same rule
// the catalogue grid uses in styles.css (AGENTS.md, rule 2); tests/ui-structure.test.js keeps them equal.
export const WIDE_QUERY = '(min-width: 48em)';
export const PHONE_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 31em) and (max-width: 64.99em)';
