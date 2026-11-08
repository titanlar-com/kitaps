import React from 'react';
import { Loader, Text } from '@mantine/core';

// What a page shows while its code arrives: the moving indicator (the owner, 8 November 2026: a
// loading state is what keeps a reader waiting on the site) and the words a screen reader announces.
export default function PageLoading({ children }) {
  return <div className="page-loading" role="status">
    <Loader size="sm" aria-hidden="true" />
    <Text c="dimmed">{children}</Text>
  </div>;
}
