import React, { useState } from 'react';
import { Divider, Drawer, NavLink, Text, UnstyledButton } from '@mantine/core';
import { IconChevronUp } from '@tabler/icons-react';
import './FooterMenu.css';

// The footer stays at the bottom of the screen as one bar. Pressing it opens the whole menu as a
// sheet half the screen tall: every section, shortcut and tool, and the catalogue's dates
// (owner's request, 7 November 2026). Each item closes the sheet before it acts.
export default function FooterMenu({ groups, current, meta, covered = false }) {
 const [opened, setOpened] = useState(false);
 const choose = action => () => { setOpened(false); action(); };
 return <footer className="site-footer">
  <UnstyledButton className="footer-dock" aria-haspopup="dialog" aria-expanded={opened} onClick={() => setOpened(true)}>
   <span className="footer-dock-label">Menü</span>
   {current && <span className="footer-dock-current">{current}</span>}
   <IconChevronUp size={20} aria-hidden="true" className="footer-dock-icon" />
  </UnstyledButton>
  <Drawer opened={opened} onClose={() => setOpened(false)} closeOnEscape={!covered} position="bottom" size="50%" title="Menü" className="footer-menu">
   <nav aria-label="Bütün bölümler ve araçlar" className="footer-menu-groups">
    {groups.map(group => <section key={group.title} className="footer-menu-group" aria-labelledby={`footer-${group.id}`}>
     <Text className="footer-menu-heading" id={`footer-${group.id}`}>{group.title}</Text>
     <ul>{group.items.map(item => <li key={item.label}>
      <NavLink component="button" type="button" className="footer-menu-item" label={item.label} leftSection={item.icon && <item.icon size={20} aria-hidden="true" />} active={Boolean(item.current)} aria-current={item.current ? 'page' : undefined} onClick={choose(item.onSelect)} />
     </li>)}</ul>
    </section>)}
   </nav>
   <Divider className="footer-menu-divider" />
   <div className="footer-meta">{meta}</div>
  </Drawer>
 </footer>;
}
