'use client';
import NextLink from 'next/link';
import type { ComponentProps } from 'react';

export default function TrackerLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink href={href} {...props} />;
}
