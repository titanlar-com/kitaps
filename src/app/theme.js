import { CLOSE_LABEL } from '../screens/shell.js';
// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { Accordion, ActionIcon, Badge, Button, Modal, TextInput, Tooltip, createTheme, defaultVariantColorsResolver } from '@mantine/core';
import { HINT_DELAY_MS, MOTION_EASE, MOTION_MS } from '../motion.js';

// Every Mantine component takes the curve and the duration of its role from src/motion.js (ADR 004).
// A floating panel only fades; a sheet keeps Mantine's direction from the edge of the screen.
const overlay={transitionProps:{transition:'fade',duration:MOTION_MS.overlay,timingFunction:MOTION_EASE}};
const sheet={transitionProps:{duration:MOTION_MS.sheet,timingFunction:MOTION_EASE}};
// Tonal and default buttons keep a boundary of at least 3:1 against every surface (WCAG 1.4.11),
// so a button never melts into its panel. Badges, alerts and icons stay without a frame.
/** @param {{variant?: string, color?: string}} props */
const controlBorder=({variant,color})=>variant==='light'?`1px solid ${!color||color==='brand'?'var(--accent-border)':'var(--control-border)'}`:variant==='default'?'1px solid var(--control-border)':undefined;
const FONT='"Outfit Variable", Outfit, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const theme = createTheme({
 fontFamily:FONT, primaryColor:'brand', primaryShade:{light:7,dark:3}, defaultRadius:'md', cursorType:'pointer', autoContrast:true,
 // Focus is shown by the central keyboard mode (src/focusMode.js), never by Mantine's ring; a
 // pressed control does not jump; reduced motion is respected.
 focusRing:'never', activeClassName:'', respectReducedMotion:true,
 // Shade 7 carries white text in the light scheme, shade 3 dark text in the dark one.
 // Mantine picks filled text once, from the light shade, so the dark scheme kept white text on
 // the light brick (2.3:1); the accent ink is the checked pair for the accent in both schemes.
 variantColorResolver:input=>{
  const colors=defaultVariantColorsResolver(input);
  if(input.variant==='filled'&&input.color==='brand')return {...colors,color:'var(--accent-ink)'};
  return colors;
 },
 // Brick red, a shade cooler than before: shade 7 is the light scheme's --accent, shade 3 the dark one's.
 colors:{brand:['#fbf4e4','#f5e6c6','#efd9a7','#e4b75f','#d9a544','#c48f2f','#a97a25','#8c651f','#6d4f18','#4f3911']},
 // Mantine's corner sizes are the stylesheet's tokens, so every component keeps the same small corners.
 radius:{xs:'var(--radius-xs)',sm:'var(--radius-sm)',md:'var(--radius)',lg:'var(--radius-lg)',xl:'var(--radius-lg)'},
 // The redesign's scale (docs/UI-REDESIGN.md): secondary text steps down to 14 and 15 px, never below.
 fontSizes:{xs:'0.875rem',sm:'0.9375rem',md:'1rem',lg:'1.125rem',xl:'1.25rem'},
 lineHeights:{xs:'1.4',sm:'1.45',md:'1.55',lg:'1.55',xl:'1.6'},
 headings:{fontFamily:FONT,fontWeight:'650',sizes:{h1:{fontSize:'2.5rem',lineHeight:'1.1'},h2:{fontSize:'1.875rem',lineHeight:'1.15'},h3:{fontSize:'1.375rem',lineHeight:'1.25'},h4:{fontSize:'1.125rem',lineHeight:'1.35'},h5:{fontSize:'1rem',lineHeight:'1.4'},h6:{fontSize:'0.9375rem',lineHeight:'1.4'}}},
 // Elevation comes from the stylesheet's tokens, so both schemes and every component share it.
 shadows:{xs:'var(--shadow-xs)',sm:'var(--shadow-sm)',md:'var(--shadow-md)',lg:'var(--shadow-lg)',xl:'var(--shadow-xl)'},
 components:{Button:Button.extend({defaultProps:{size:'md'},vars:(_,props)=>({root:{'--button-bd':controlBorder(props)}})}),ActionIcon:ActionIcon.extend({defaultProps:{size:44},vars:(_,props)=>({root:{'--ai-bd':controlBorder(props)}})}),TextInput:{defaultProps:{size:'md'}},Select:{defaultProps:{size:'md',comboboxProps:overlay}},MultiSelect:{defaultProps:{size:'md',comboboxProps:overlay}},Badge:{defaultProps:{size:'lg',variant:'light',radius:'sm'}},Drawer:{defaultProps:{...sheet,closeButtonProps:{'aria-label':CLOSE_LABEL},overlayProps:{backgroundOpacity:.35,blur:3}}},Modal:{defaultProps:overlay},Popover:{defaultProps:overlay},Tooltip:{defaultProps:{...overlay,openDelay:HINT_DELAY_MS}},Combobox:{defaultProps:overlay},Accordion:{defaultProps:{transitionDuration:MOTION_MS.disclosure}},
 // Owner's rule of 8 November 2026 (at most 5 px): components whose own default is a circle or a pill take a token.
 Indicator:{defaultProps:{radius:'xl'}},Avatar:{defaultProps:{radius:'md'}},Chip:{defaultProps:{radius:'md'}},Pill:{defaultProps:{radius:'md'}},Switch:{defaultProps:{radius:'sm'}},Radio:{defaultProps:{radius:'xl',iconColor:'var(--accent-ink)'}},Checkbox:{defaultProps:{iconColor:'var(--accent-ink)'}},RadioIndicator:{defaultProps:{radius:'xl',iconColor:'var(--accent-ink)'}},Slider:{defaultProps:{radius:'xl'}},Stepper:{defaultProps:{radius:'md'}},ThemeIcon:{defaultProps:{radius:'md'}},Skeleton:{defaultProps:{radius:'md'}},SegmentedControl:{defaultProps:{radius:'md',transitionDuration:MOTION_MS.move,transitionTimingFunction:MOTION_EASE}},Notification:{defaultProps:{radius:'md'}},Kbd:{defaultProps:{radius:'sm'}},Loader:{defaultProps:{type:'bars'}},Menu:{defaultProps:{...overlay,shadow:'md'}},HoverCard:{defaultProps:{...overlay,shadow:'lg',openDelay:HINT_DELAY_MS}},Spoiler:{defaultProps:{transitionDuration:MOTION_MS.disclosure}},FloatingIndicator:{defaultProps:{transitionDuration:MOTION_MS.move}},Card:{defaultProps:{radius:'lg',padding:'lg'}},Paper:{defaultProps:{radius:'lg'}},Timeline:{defaultProps:{bulletSize:28,lineWidth:2,radius:'md'}},Progress:{defaultProps:{radius:0}},Collapse:{defaultProps:{transitionDuration:MOTION_MS.disclosure,transitionTimingFunction:MOTION_EASE}}}
});

// Mantine reads its primary colour from these variables. They point at the wood scheme's accent,
// so a filled button or a switch follows the scheme the reader chose.
const accentVariables={filled:'var(--accent)','filled-hover':'var(--accent-hover)',light:'var(--accent-soft)','light-hover':'var(--accent-soft-hover)','light-color':'var(--accent-strong)',outline:'var(--accent)'};
const accent=Object.fromEntries(Object.entries(accentVariables).flatMap(([name,value])=>[[`--mantine-color-brand-${name}`,value],[`--mantine-primary-color-${name}`,value]]));
// Mantine writes these per colour mode, so they are given for both modes, not only for all.
// Mantine's own neutrals point at the wood layers too, so an unchecked radio or a segmented control
// does not bring its grey into a wood scheme.
const darkNeutrals=Object.fromEntries(['--ink','--ink-2','--muted','--control-line','--line-strong','--surface-3','--surface-2','--surface','--paper','--paper'].map((token,index)=>[`--mantine-color-dark-${index}`,`var(${token})`]));
const lightNeutrals=Object.fromEntries(['--surface-2','--surface-2','--surface-3','--line-strong','--control-line','--muted','--muted','--ink-2','--ink-2','--ink'].map((token,index)=>[`--mantine-color-gray-${index}`,`var(${token})`]));
export const cssVariablesResolver=()=>({variables:accent,light:{...accent,...lightNeutrals},dark:{...accent,...darkNeutrals}});
