'use client';

import { useEffect, useRef } from 'react';
import mascot from '@/assets/rope/mascot-front.webp';
import rope from '@/assets/rope/rope-tile.png';
import knot from '@/assets/rope/end-knot.png';
import type { RopeEntry } from '@/lib/rope/entry';
import type { RopeActivation, RopeSnapshot } from '@/lib/rope/types';
import { leisurePullSettings } from '@/lib/rope/leisure-pull';
import '@/styles/rope.css';

export function LeisureRope({ onUpdate, onActivate, onReady, onError }: {
  onUpdate?: (snapshot: RopeSnapshot) => void;
  onActivate?: (activation: RopeActivation) => void;
  onReady?: (entry: RopeEntry | null) => void;
  onError?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let entry: RopeEntry | undefined;

    async function mount(host: HTMLDivElement) {
      const { createRopeEntry } = await import('@/lib/rope/entry');
      if (disposed) return;
      const instance = await createRopeEntry({
        host,
        assets: { mascot: mascot.src, rope: rope.src, knot: knot.src },
        layout: ({ width }) => ({
          ...(width < 760
            ? { anchorX: width - 118, anchorY: -36, restLength: 112, mascotWidth: 44, ropeWidth: 4.2 }
            : { anchorX: width - 180, anchorY: -50, restLength: 146, mascotWidth: 54, ropeWidth: 5 }),
          pull: leisurePullSettings(window.innerWidth),
        }),
        onUpdate,
        onActivate,
      });
      if (disposed) instance.destroy();
      else {
        entry = instance;
        onReady?.(instance);
      }
    }

    void mount(host).catch((error: unknown) => {
      if (!disposed) {
        onError?.();
        console.error('拉绳彩蛋加载失败。', error);
      }
    });

    return () => {
      disposed = true;
      entry?.destroy();
      onReady?.(null);
    };
  }, [onUpdate, onActivate, onReady, onError]);

  return <div ref={hostRef} className="leisure-rope" />;
}
