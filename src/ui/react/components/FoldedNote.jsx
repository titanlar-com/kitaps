import { Spoiler } from '@mantine/core';
import './FoldedNote.css';

// Mantine clips a note in rem but offers its control by comparing pixels, so the two disagree when
// the browser's text is not 16 px and a note that fits gets a control that opens nothing. The fold
// is given in pixels at the current text size and Mantine's rem scale is cancelled on the clip.
const textScale = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;

/** A note folded at `fold` pixels of default text. The fold grows with the browser's text size. */
export function FoldedNote({ fold, className, showLabel, hideLabel, ...props }) {
 const scale = textScale();
 return <Spoiler className={`folded-note ${className}`} maxHeight={fold * scale} styles={{ content: { '--mantine-scale': 1 / scale } }} showLabel={showLabel} hideLabel={hideLabel} {...props} />;
}
