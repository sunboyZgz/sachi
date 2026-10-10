import scroll from '@/assets/gallery/frames/scroll-tall.webp';
import tall from '@/assets/gallery/frames/album-tall.webp';
import landscape from '@/assets/gallery/frames/album-landscape.webp';
import silk from '@/assets/gallery/frames/silk-portrait.webp';
import wide from '@/assets/gallery/frames/album-wide.webp';
import portrait from '@/assets/gallery/frames/album-portrait.webp';
import small from '@/assets/gallery/frames/album-small.webp';
import scrollShadow from '@/assets/gallery/frames/scroll-tall-silhouette.png';
import tallShadow from '@/assets/gallery/frames/album-tall-silhouette.png';
import landscapeShadow from '@/assets/gallery/frames/album-landscape-silhouette.png';
import silkShadow from '@/assets/gallery/frames/silk-portrait-silhouette.png';
import wideShadow from '@/assets/gallery/frames/album-wide-silhouette.png';
import portraitShadow from '@/assets/gallery/frames/album-portrait-silhouette.png';
import smallShadow from '@/assets/gallery/frames/album-small-silhouette.png';

export const galleryFrames = new Map([
  ['scroll-tall', { art: scroll, shadow: scrollShadow }],
  ['album-tall', { art: tall, shadow: tallShadow }],
  ['album-landscape', { art: landscape, shadow: landscapeShadow }],
  ['silk-portrait', { art: silk, shadow: silkShadow }],
  ['album-wide', { art: wide, shadow: wideShadow }],
  ['album-portrait', { art: portrait, shadow: portraitShadow }],
  ['album-small', { art: small, shadow: smallShadow }],
]);
