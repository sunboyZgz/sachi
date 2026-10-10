import NextLink from 'next/link';
import type { ComponentProps } from 'react';
import { sitePath } from '@/lib/site-path';

type Props = Omit<ComponentProps<'a'>, 'href'> & { href: string };
export function SiteLink(props: Props) {
  // Static hosting cannot negotiate App Router deployment versions. Reading the
  // complete new document on navigation avoids combining old RSC with new code.
  if (process.env.BLOG_CONTENT_MODE === 'release') return <a {...props} href={sitePath(props.href)} />;
  return <NextLink {...props} />;
}
