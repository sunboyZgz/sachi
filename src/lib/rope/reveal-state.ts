import { DEFAULTS } from './config/defaults';
import { clamp } from './math';
import type { RopeSnapshot } from './types';

export type RevealPhase = 'idle' | 'dragging' | 'returning' | 'committed' | 'closing';
export type RevealState = { phase: RevealPhase; progress: number };
export type RevealInput = Pick<RopeSnapshot, 'phase' | 'extraPull' | 'dragging' | 'reducedMotion'>;

export function updateReveal(state: RevealState, input: RevealInput, triggerDistance = DEFAULTS.triggerDistance): RevealState {
  if (state.phase === 'committed' || state.phase === 'closing') return state;
  if (input.phase === 'idle' || input.phase === 'disabled') return { phase: 'idle', progress: 0 };
  const progress = input.reducedMotion ? 0 : clamp(Math.max(0, input.extraPull) / triggerDistance, 0, 1);
  if (input.dragging) return { phase: 'dragging', progress };
  if (state.phase === 'idle') return state;
  return { phase: 'returning', progress: Math.min(state.progress, progress) };
}

export function revealGeometry(progress: number, width: number, height: number) {
  const p = clamp(progress, 0, 1);
  const lift = p * p * (3 - 2 * p) * height;
  const bow = (width < 760 ? 4 : 8) * Math.sin(Math.PI * p);
  const edge = `M 0 ${height - bow} Q ${width / 2} ${height + bow} ${width} ${height - bow}`;
  return {
    lift,
    clip: `M 0 0 H ${width} V ${height - bow} Q ${width / 2} ${height + bow} 0 ${height - bow} Z`,
    shadow: `${edge} L ${width} ${height - bow + 10} Q ${width / 2} ${height + bow + 10} 0 ${height - bow + 10} Z`,
    shadowOpacity: Math.sin(Math.PI * p),
  };
}
