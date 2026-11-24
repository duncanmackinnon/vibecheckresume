'use client';
import NextLink from 'next/link';
import type { ComponentProps } from 'react';
import { useTracker } from './TrackerProvider';

export default function TrackerLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const { snapshot } = useTracker();
  let target = href;
  if (snapshot?.demo && typeof href === 'string' && /^\/(dashboard|discover|applications|tasks|resumes|assistant|settings)([/?#]|$)/.test(href)) {
    const url = new URL(href, 'https://preview.invalid');
    url.searchParams.set('preview', '1');
    target = `${url.pathname}${url.search}${url.hash}`;
  }
  return <NextLink href={target} {...props} />;
}
