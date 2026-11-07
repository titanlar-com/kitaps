// Moved verbatim from App.jsx (architecture plan, phase 1, 7 November 2026).
import { Accordion, ActionIcon, Badge, Button, Modal, TextInput, Tooltip, createTheme, defaultVariantColorsResolver } from '@mantine/core';
import { MOTION_EASE, MOTION_MS } from '../motion';

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
 fontSizes:{xs:'1rem',sm:'1rem',md:'1rem',lg:'1.125rem',xl:'1.25rem'},
 headings:{fontFamily:FONT,fontWeight:'600',sizes:{h1:{fontSize:'2.25rem',lineHeight:'1.15'},h2:{fontSize:'1.75rem',lineHeight:'1.2'},h3:{fontSize:'1.25rem',lineHeight:'1.3'},h4:{fontSize:'1.0625rem',lineHeight:'1.35'}}},
 components:{Button:Button.extend({defaultProps:{size:'md'},vars:(_,props)=>({root:{'--button-bd':controlBorder(props)}})}),ActionIcon:ActionIcon.extend({defaultProps:{size:44},vars:(_,props)=>({root:{'--ai-bd':controlBorder(props)}})}),TextInput:{defaultProps:{size:'md'}},Select:{defaultProps:{size:'md',comboboxProps:motion}},MultiSelect:{defaultProps:{size:'md',comboboxProps:motion}},Badge:{defaultProps:{size:'lg',variant:'light',radius:'sm'}},Drawer:{defaultProps:{...motion,closeButtonProps:{'aria-label':'Kapat'},overlayProps:{backgroundOpacity:.35,blur:3}}},Modal:{defaultProps:motion},Popover:{defaultProps:motion},Tooltip:{defaultProps:motion},Combobox:{defaultProps:motion},Accordion:{defaultProps:{transitionDuration:MOTION_MS}},SegmentedControl:{defaultProps:{transitionDuration:MOTION_MS,transitionTimingFunction:MOTION_EASE}},Collapse:{defaultProps:{transitionDuration:MOTION_MS,transitionTimingFunction:MOTION_EASE}}}
});
