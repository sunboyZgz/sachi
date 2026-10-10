import source from './profile.json';
import { profileSchema } from './profile-schema';
export { profileSchema } from './profile-schema';

// Public information only. Deployment credentials belong in blog.config.json,
// which is read on the server and never imported into a client component.
export const profile = Object.freeze(profileSchema.parse(source));

// These strings describe the lettering already embedded in the two SVGs.
// A changed profile uses real text automatically, not stale illustration text.
export const brandArtwork = {
  title: { text: '请叫我木头人', src: '/assets/brand-title-study.svg' },
  signature: { text: '吾生君未生，君生吾已老', src: '/assets/signature-study.svg' },
} as const;
