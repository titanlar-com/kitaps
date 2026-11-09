import { ThemeIcon, Text, Title } from '@mantine/core';
import { IconBook2 } from '@tabler/icons-react';
import './EmptyState.css';

/** A page with nothing to show yet: a short heading, one plain sentence and the next step. The
 * three empty frames are a bare shelf, drawn for the eye only. */
export default function EmptyState({ icon: Icon = IconBook2, title, children, action, className = '' }) {
  return <div className={`desk-empty ${className}`.trim()}>
    <div className="desk-empty-shelf" aria-hidden="true">
      <span />
      <span><ThemeIcon className="desk-empty-icon" variant="transparent" size={36}><Icon size={28} stroke={1.5} /></ThemeIcon></span>
      <span />
    </div>
    <Title order={2} className="desk-empty-title">{title}</Title>
    <Text c="dimmed" className="desk-empty-text">{children}</Text>
    {action && <div className="desk-empty-action">{action}</div>}
  </div>;
}
