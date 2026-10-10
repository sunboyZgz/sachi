import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const nextConfig = (phase: string): NextConfig => {
  const development = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    output: development ? undefined : 'export',
    // In export mode Next treats a custom distDir as the export destination.
    // Keep dev fixtures outside .next so production cleaning cannot remove them.
    distDir: development && process.env.INCLUDE_FIXTURES === 'true' ? '.next-fixtures-dev' : '.next',
    devIndicators: false,
    trailingSlash: true,
    basePath: process.env.NEXT_PUBLIC_BLOG_BASE_PATH || '',
    assetPrefix: process.env.BLOG_ASSET_PREFIX || undefined,
    turbopack: {
      root: process.cwd(),
    },
    images: {
      unoptimized: true,
    },
  };
};

export default nextConfig;
