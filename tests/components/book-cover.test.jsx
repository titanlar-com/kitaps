import { describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithTheme } from './render';
import { BookCover } from '../../src/app/BookCover';
import { books } from '../../src/app/catalogData';

// The owner, 8 November 2026: a waiting state keeps the reader on the page.
const covered = books.find(book => book.cover);
const skeleton = container => container.querySelector('.cover-skeleton');

describe('BookCover', () => {
  it('shows a skeleton until the cover has loaded', () => {
    const { container } = renderWithTheme(<BookCover book={covered} onOpen={() => {}} />);
    expect(skeleton(container)).not.toBeNull();
    fireEvent.load(container.querySelector('img'));
    expect(skeleton(container)).toBeNull();
  });

  it('drops the skeleton when the cover fails, and the placeholder takes over', () => {
    const { container } = renderWithTheme(<BookCover book={covered} onOpen={() => {}} />);
    fireEvent.error(container.querySelector('img'));
    expect(skeleton(container)).toBeNull();
    expect(container.querySelector('.cover-placeholder')).not.toBeNull();
  });
});
