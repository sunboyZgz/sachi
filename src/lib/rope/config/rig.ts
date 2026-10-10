export const RIG = {
  version: 1,
  mascot: {
    file: 'mascot-front.png',
    webp: 'mascot-front.webp',
    sourceSize: [512, 779],
    attachmentPx: [252.3717, 16.9348],
    attachmentNormalized: [0.492913, 0.021739],
    displayWidth: 54,
    transform: 'translate(endpoint) rotate(angle) translate(-attachment*scale) scale',
  },
  rope: {
    file: 'rope-tile.png',
    sourceSize: [256, 48],
    lengthAxis: 'x',
    repeatAxis: 'x',
    recommendedThickness: 5,
    seamMaxRGBAError: 0,
    phaseAnchor: 'pendant-end',
    note: 'One material period has constant CSS length; spool adds periods, never stretches all pixels.',
  },
  knot: {
    file: 'end-knot.png',
    sourceSize: [144, 160],
    width: 10.5,
    bottomOffset: 1.5,
  },
  provenance: 'Reused existing generated mascot; cleaned alpha and isolated geometry. Rope is a cyclically blended crop of an existing generated straight cord; no original layered design file is claimed.',
} as const;
