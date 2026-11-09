import { beforeEach, describe, expect, it } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThemeTweaker from '../../src/ui/react/components/ThemeTweaker';

// env="test" turns Mantine's transitions off, so the panel is fully there once it is found.
const renderWithTheme = element => render(<MantineProvider env="test">{element}</MantineProvider>);

describe('ThemeTweaker', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-wood'); });
  const open = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Renk düzeni' }));
    await screen.findByRole('radio', { name: /Ceviz/ });
  };

  it('offers the three woods with walnut chosen first', async () => {
    renderWithTheme(<ThemeTweaker />);
    await open();
    expect(screen.getByRole('radio', { name: /Ceviz/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Meşe/ }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: /Akasya/ })).toBeTruthy();
  });

  it('applies a chosen wood at once and remembers it', async () => {
    renderWithTheme(<ThemeTweaker />);
    await open();
    fireEvent.click(screen.getByRole('radio', { name: /Meşe/ }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-wood')).toBe('mese'));
    expect(localStorage.getItem('kitapatlasi:wood')).toBe('mese');
    expect(screen.getByRole('radio', { name: /Meşe/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('switches between dark and light in the same panel', async () => {
    renderWithTheme(<ThemeTweaker />);
    await open();
    fireEvent.click(screen.getByLabelText('Açık'));
    await waitFor(() => expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('light'));
  });
});
