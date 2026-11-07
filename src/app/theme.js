// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { Accordion, ActionIcon, Badge, Button, Modal, TextInput, Tooltip, createTheme, defaultVariantColorsResolver } from '@mantine/core';
import { MOTION_EASE, MOTION_MS, TOOLTIP_DELAY_MS } from '../motion.js';

// One motion curve and duration for every JavaScript transition (AGENT.md motion contract),
// from src/motion.js; styles.css holds the same values as --motion-ease and --motion-base.
const motion={transitionProps:{duration:MOTION_MS,timingFunction:MOTION_EASE}};
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
 colors:{brand:['#fcf0ee','#f6e3df','#ecc2ba','#f0907d','#e0705c','#c95443','#b54434','#a3392b','#7c2a1f','#5a1f17']},
 // Mantine's corner sizes are the stylesheet's tokens, so every component keeps the same small corners.
 radius:{xs:'var(--radius-xs)',sm:'var(--radius-sm)',md:'var(--radius)',lg:'var(--radius-lg)',xl:'var(--radius-lg)'},
 // The redesign's scale (docs/UI-REDESIGN.md): secondary text steps down to 14 and 15 px, never below.
 fontSizes:{xs:'0.875rem',sm:'0.9375rem',md:'1rem',lg:'1.125rem',xl:'1.25rem'},
 lineHeights:{xs:'1.4',sm:'1.45',md:'1.55',lg:'1.55',xl:'1.6'},
 headings:{fontFamily:FONT,fontWeight:'650',sizes:{h1:{fontSize:'2.5rem',lineHeight:'1.1'},h2:{fontSize:'1.875rem',lineHeight:'1.15'},h3:{fontSize:'1.375rem',lineHeight:'1.25'},h4:{fontSize:'1.125rem',lineHeight:'1.35'},h5:{fontSize:'1rem',lineHeight:'1.4'},h6:{fontSize:'0.9375rem',lineHeight:'1.4'}}},
 // Elevation comes from the stylesheet's tokens, so both schemes and every component share it.
 shadows:{xs:'var(--shadow-xs)',sm:'var(--shadow-sm)',md:'var(--shadow-md)',lg:'var(--shadow-lg)',xl:'var(--shadow-xl)'},
 components:{Button:Button.extend({defaultProps:{size:'md'},vars:(_,props)=>({root:{'--button-bd':controlBorder(props)}})}),ActionIcon:ActionIcon.extend({defaultProps:{size:44},vars:(_,props)=>({root:{'--ai-bd':controlBorder(props)}})}),TextInput:{defaultProps:{size:'md'}},Select:{defaultProps:{size:'md',comboboxProps:motion}},MultiSelect:{defaultProps:{size:'md',comboboxProps:motion}},Badge:{defaultProps:{size:'lg',variant:'light',radius:'sm'}},Drawer:{defaultProps:{...motion,closeButtonProps:{'aria-label':'Kapat'},overlayProps:{backgroundOpacity:.35,blur:3}}},Modal:{defaultProps:motion},Popover:{defaultProps:motion},Tooltip:{defaultProps:motion},Combobox:{defaultProps:motion},Accordion:{defaultProps:{transitionDuration:MOTION_MS}},
 // Owner's rule of 8 November 2026 (at most 5 px): components whose own default is a circle or a pill take a token.
 Indicator:{defaultProps:{radius:'xl'}},Avatar:{defaultProps:{radius:'md'}},Chip:{defaultProps:{radius:'md'}},Pill:{defaultProps:{radius:'md'}},Switch:{defaultProps:{radius:'sm'}},Radio:{defaultProps:{radius:'xl'}},Slider:{defaultProps:{radius:'xl'}},Stepper:{defaultProps:{radius:'md'}},ThemeIcon:{defaultProps:{radius:'md'}},Skeleton:{defaultProps:{radius:'md'}},SegmentedControl:{defaultProps:{radius:'md',transitionDuration:MOTION_MS,transitionTimingFunction:MOTION_EASE}},Notification:{defaultProps:{radius:'md'}},Kbd:{defaultProps:{radius:'sm'}},Menu:{defaultProps:{...motion,shadow:'md'}},HoverCard:{defaultProps:{...motion,shadow:'lg',openDelay:TOOLTIP_DELAY_MS}},Spoiler:{defaultProps:{transitionDuration:MOTION_MS}},FloatingIndicator:{defaultProps:{transitionDuration:MOTION_MS}},Card:{defaultProps:{radius:'lg',padding:'lg'}},Paper:{defaultProps:{radius:'lg'}},Timeline:{defaultProps:{bulletSize:28,lineWidth:2,radius:'md'}},Progress:{defaultProps:{radius:'xl'}},Collapse:{defaultProps:{transitionDuration:MOTION_MS,transitionTimingFunction:MOTION_EASE}}}
});
