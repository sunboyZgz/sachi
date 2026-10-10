import settings from './motion.json';

export type TurnSettings = typeof settings;
export type TurnSlot = { outStart: number; outEnd: number; inStart: number; inEnd: number };
export const turnSettings: Readonly<TurnSettings> = settings;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const p = clamp(value); return p * p * (3 - 2 * p); };

export function scheduleTurn(count: number, config = turnSettings) {
  let total = 0;
  const slots = Array.from({ length: count }, (_, index): TurnSlot => {
    const outStart = index * config.outStagger;
    const outEnd = outStart + config.outDuration;
    const inStart = Math.max(outEnd + config.bridge, config.outDuration + config.bridge + index * config.inStagger);
    const inEnd = inStart + config.inDuration;
    total = Math.max(total, inEnd);
    return { outStart, outEnd, inStart, inEnd };
  });
  return { slots, total };
}

export function sampleTurn(time: number, slot: TurnSlot, config = turnSettings) {
  return {
    oldOpen: 1 - smooth((time - slot.outStart) / config.outDuration),
    newOpen: 1 - (1 - clamp((time - slot.inStart) / config.inDuration)) ** 3,
  };
}

export function turnAppearance(open: number, scroll: boolean, incoming: boolean) {
  const p = clamp(open), closed = 1 - p;
  const angle = scroll ? 0 : (incoming ? -1 : 1) * Math.sin(closed * Math.PI / 2) * 18;
  return {
    visibility: p < .001 ? 'hidden' : 'visible',
    opacity: p === 0 ? 0 : Math.min(1, p * 9),
    transform: scroll ? `translateY(${-4 * closed}px)` : `perspective(1000px) rotateY(${angle}deg)`,
    clip: scroll ? `inset(0 0 ${closed * 100}% 0)` : `inset(0 ${closed * 100}% 0 0)`,
    shadowOpacity: .10 + .045 * p,
    edgeOpacity: Math.sin(Math.PI * p) * .85,
    edgePosition: `${p * 100}%`,
    angle,
  };
}

export function paintTurn(card: HTMLElement, open: number, incoming: boolean) {
  const surface = card.querySelector<HTMLElement>('.toy-surface')!;
  const shadow = card.querySelector<HTMLElement>('.toy-mount-shadow')!;
  const edge = card.querySelector<HTMLElement>('.toy-turn-edge')!;
  const scroll = card.dataset.turnKind === 'scroll';
  const appearance = turnAppearance(open, scroll, incoming);
  card.style.visibility = appearance.visibility;
  card.style.opacity = String(appearance.opacity);
  card.style.transform = appearance.transform;
  surface.style.clipPath = shadow.style.clipPath = appearance.clip;
  shadow.style.opacity = String(appearance.shadowOpacity);
  edge.style.opacity = String(appearance.edgeOpacity);
  if (scroll) edge.style.top = appearance.edgePosition;
  else edge.style.left = appearance.edgePosition;
}

export function clearTurn(card: HTMLElement) {
  for (const property of ['visibility', 'opacity', 'transform']) card.style.removeProperty(property);
  card.querySelector<HTMLElement>('.toy-surface')?.style.removeProperty('clip-path');
  const shadow = card.querySelector<HTMLElement>('.toy-mount-shadow');
  shadow?.style.removeProperty('clip-path');
  shadow?.style.removeProperty('opacity');
  card.querySelector<HTMLElement>('.toy-turn-edge')?.removeAttribute('style');
}
