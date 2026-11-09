import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GirlIcon } from '../../src/ui/react/app/icons';

// The owner, 8 November 2026: a little girl, plainer than the old figure with its hair buns, in the
// Phosphor style. Phosphor has no girl, so she is drawn on its 256 grid with its 16-unit line.
describe('GirlIcon', () => {
  it('uses the Phosphor grid and line', () => {
    const svg = render(<GirlIcon size={29} />).container.querySelector('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 256 256');
    expect(svg.getAttribute('stroke-width')).toBe('16');
    expect(svg.getAttribute('width')).toBe('29');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('is a plain figure: a head, a dress and legs', () => {
    const svg = render(<GirlIcon />).container.querySelector('svg');
    expect(svg.querySelectorAll('circle')).toHaveLength(1);
    expect(svg.querySelectorAll('path')).toHaveLength(2);
  });
});
