'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Image from 'next/image';
import room from '@/assets/stage/room-still.webp';
import type { StagePhase } from '@/lib/stage/types';
import type { createWindScene } from '@/lib/stage/scene';
import type { GalleryItem } from '@/lib/gallery/types';
import { ToyGallery } from './ToyGallery';
import '@/styles/stage.css';

export function LeisureStage({ phase, items, returnControl }: { phase: StagePhase; items: readonly GalleryItem[]; returnControl: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createWindScene> | null>(null);
  const phaseRef = useRef(phase);
  const mounted = phase !== 'closed';

  useEffect(() => {
    phaseRef.current = phase;
    scene.current?.setActive(phase === 'preview' || phase === 'open');
  }, [phase]);

  useEffect(() => {
    const host = hostRef.current;
    if (!mounted || !host) return;
    let disposed = false;
    void import('@/lib/stage/scene').then(({ createWindScene }) => {
      if (disposed) return;
      const instance = createWindScene(host);
      scene.current = instance;
      instance.setActive(phaseRef.current === 'preview' || phaseRef.current === 'open');
    }).catch(() => {
      if (!disposed) {
        host.dataset.sceneStatus = 'static';
      }
    });
    return () => {
      disposed = true;
      scene.current?.destroy();
      scene.current = null;
    };
  }, [mounted]);

  return (
    <section className="leisure-room" aria-label="书斋舞台">
      <div className="wind-scene-background" aria-hidden="true">
        <div ref={hostRef} className="wind-scene-art">
          <Image className="wind-scene-still" src={room} alt="" fill sizes="100vw" loading="eager" fetchPriority="high" unoptimized />
        </div>
      </div>
      <ToyGallery items={items} phase={phase} returnControl={returnControl} />
    </section>
  );
}
