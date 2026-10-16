import { defaultConfig } from '../../src/lib/blog/schema';

/** Legacy source-layout regression fixtures, independent of the new-project default. */
export function legacyConfig(...args: Parameters<typeof defaultConfig>) {
  return { ...defaultConfig(...args), contentDir: 'content' as const };
}
