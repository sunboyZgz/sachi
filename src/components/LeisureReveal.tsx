'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { LeisureRope } from './LeisureRope';
import { LeisureStage } from './LeisureStage';
import { createRevealController } from '@/lib/rope/reveal';
import type { RopeEntry } from '@/lib/rope/entry';
import type { RopeSnapshot } from '@/lib/rope/types';
import type { StagePhase } from '@/lib/stage/types';
import type { GalleryItem } from '@/lib/gallery/types';
import '@/styles/reveal.css';

export function LeisureReveal({ children, items }: { children: ReactNode; items: readonly GalleryItem[] }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = `reveal-clip-${id}`;
  const shadowId = `reveal-shadow-${id}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const ropeRef = useRef<HTMLDivElement>(null);
  const returnRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clipRef = useRef<SVGPathElement>(null);
  const shadowRef = useRef<SVGPathElement>(null);
  const shadowSvgRef = useRef<SVGSVGElement>(null);
  const controller = useRef<ReturnType<typeof createRevealController> | null>(null);
  const [stagePhase, setStagePhase] = useState<StagePhase>('closed');

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    const face = faceRef.current;
    const backdrop = backdropRef.current;
    const rope = ropeRef.current;
    const returnButton = returnRef.current;
    const clip = clipRef.current;
    const canvas = canvasRef.current;
    const shadow = shadowRef.current;
    const shadowSvg = shadowSvgRef.current;
    if (!root || !content || !face || !backdrop || !rope || !returnButton || !clip || !shadow || !shadowSvg || !canvas) return;
    const instance = createRevealController({ root, content, face, backdrop, rope, returnButton, clip, shadow, shadowSvg, clipId, canvas, onStageChange: setStagePhase });
    controller.current = instance;
    return () => {
      instance.destroy();
      controller.current = null;
    };
  }, [clipId]);

  const update = useCallback((snapshot: RopeSnapshot) => controller.current?.update(snapshot), []);
  const commit = useCallback(() => controller.current?.commit(), []);
  const bind = useCallback((entry: RopeEntry | null) => controller.current?.bind(entry), []);
  const recover = useCallback(() => controller.current?.reset(), []);

  return (
    <div ref={rootRef} className="leisure-reveal" data-reveal-phase="idle" data-reveal-progress="0">
      <div className="leisure-reveal-stage">
        <div ref={backdropRef} className="leisure-reveal-backdrop" inert>
          <LeisureStage phase={stagePhase} items={items} returnControl={
            <button ref={returnRef} className="backlink leisure-reveal-return" type="button" hidden>
              <span aria-hidden="true">←</span><span className="leisure-reveal-return-label">返回文章</span>
            </button>
          } />
        </div>
        <div className="leisure-reveal-sheet">
          <div ref={faceRef} className="leisure-reveal-face">
            <div ref={contentRef} className="leisure-reveal-content">{children}</div>
          </div>
          <canvas ref={canvasRef} width={0} height={0} className="leisure-reveal-peel" aria-hidden="true" />
          <svg ref={shadowSvgRef} className="leisure-reveal-edge" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id={shadowId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--moss-dark)" stopOpacity=".09" />
                <stop offset="1" stopColor="var(--moss-dark)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path ref={shadowRef} fill={`url(#${shadowId})`} />
          </svg>
        </div>
        <div ref={ropeRef} className="leisure-reveal-rope frame">
          <LeisureRope onUpdate={update} onActivate={commit} onReady={bind} onError={recover} />
        </div>
      </div>
      <svg className="leisure-reveal-defs" aria-hidden="true" focusable="false">
        <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><path ref={clipRef} /></clipPath></defs>
      </svg>
    </div>
  );
}
