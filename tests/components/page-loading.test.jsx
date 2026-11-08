import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from './render';
import PageLoading from '../../src/components/PageLoading';

describe('PageLoading', () => {
  it('announces what is loading and shows the moving indicator', () => {
    const { container } = renderWithTheme(<PageLoading>Kitapçılar yükleniyor…</PageLoading>);
    expect(screen.getByRole('status').textContent).toContain('Kitapçılar yükleniyor…');
    expect(container.querySelector('.mantine-Loader-root')).not.toBeNull();
  });
});
