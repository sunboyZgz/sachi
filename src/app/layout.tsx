import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/tokens.css';
import '@/styles/site.css';
import '@/styles/code-highlight.css';
import '@/styles/series.css';
import { profile, siteAsset } from '@/config/site';
import { getSeoContext, noIndex } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const context = await getSeoContext();
  return {
    metadataBase: context.siteUrl && context.release ? new URL(context.siteUrl) : null,
    title: {
      default: profile.name,
      template: `%s · ${profile.name}`,
    },
    description: profile.seo.description ?? profile.bio,
    authors: [{ name: profile.name }],
    creator: profile.name,
    robots: context.indexable ? { index: true, follow: true } : noIndex,
    icons: { icon: siteAsset('/assets/favicon.svg') },
  };
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#faf8f2',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main">跳到正文</a>
        {children}
      </body>
    </html>
  );
}
