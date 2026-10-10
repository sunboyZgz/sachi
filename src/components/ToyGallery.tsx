'use client';

import Image from 'next/image';
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { galleryFrames } from '@/lib/gallery/assets';
import { layout } from '@/lib/gallery/config';
import { rectPercent } from '@/lib/gallery/items';
import { volumeWorks } from '@/lib/gallery/volume';
import { createGalleryDialog } from '@/lib/gallery/dialog';
import { createGalleryTurn, type TurnView } from '@/lib/gallery/turn';
import type { GalleryFrame, GalleryItem, GallerySlot } from '@/lib/gallery/types';
import type { StagePhase } from '@/lib/stage/types';
import '@/styles/gallery.css';

const subscribe = (notify: () => void) => {
  const media = matchMedia(`(min-width: ${layout.desktopMinWidth}px)`);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const desktopSnapshot = () => matchMedia(`(min-width: ${layout.desktopMinWidth}px)`).matches;
const initialView: TurnView = { page: 0, incoming: null, status: 'idle', error: '', message: '' };
const volumeNumerals = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];

function MountedWork({ item, frame, slot, index, desktop, open }: {
  item: GalleryItem; frame: GalleryFrame; slot: GallerySlot; index: number; desktop: boolean;
  open: (item: GalleryItem, button: HTMLButtonElement) => void;
}) {
  const images = galleryFrames.get(frame.id)!;
  const style = {
    aspectRatio: `${frame.size[0]} / ${frame.size[1]}`,
    ...(desktop ? rectPercent(slot.rect, layout.sceneSize) : {}),
    '--toy-label-scale': desktop ? slot.rect[2] / frame.size[0] : 1,
  } as CSSProperties;
  return (
    <li className="toy-mount" style={style} data-work-id={item.id} data-frame={frame.id}
      data-turn-kind={frame.kind === 'scroll' || frame.id === 'silk-portrait' ? 'scroll' : 'album'}>
      <Image className="toy-mount-shadow" src={images.shadow} alt="" unoptimized draggable={false} loading="eager" />
      <div className="toy-surface">
        <button type="button" className="toy-cover-button" style={rectPercent(frame.cover, frame.size)} data-work-id={item.id}
          aria-label={`${String(index + 1).padStart(2, '0')} ${item.title}，打开演示`} onClick={(event) => open(item, event.currentTarget)}>
          {item.cover ? <Image src={item.cover} alt="" width={320} height={320} unoptimized loading="eager" draggable={false}
            style={{ objectFit: item.coverFit, objectPosition: `${item.coverPosition?.[0] ?? 50}% ${item.coverPosition?.[1] ?? 50}%` }}
            onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
          <span className="toy-cover-fallback" aria-hidden="true">封面待补</span>
          <span className="toy-play-hint" aria-hidden="true">▷</span>
        </button>
        <Image className="toy-mount-art" src={images.art} alt="" unoptimized draggable={false} loading="eager" />
        <span className="toy-number" style={rectPercent(frame.number, frame.size)}>{String(index + 1).padStart(2, '0')}</span>
        <span className="toy-title" style={rectPercent(frame.title, frame.size)} title={item.title}>{item.title}</span>
      </div>
      <div className="toy-turn-edge" aria-hidden="true" />
    </li>
  );
}

function Volume({ items, page, desktop, incoming, busy, open }: {
  items: readonly GalleryItem[]; page: number; desktop: boolean; incoming: boolean; busy: boolean;
  open: (item: GalleryItem, button: HTMLButtonElement) => void;
}) {
  return <ul className="toy-volume" data-page={page} data-incoming={incoming || undefined} aria-label={`第 ${page + 1} 卷作品`}
    inert={busy} aria-hidden={busy || undefined} style={incoming ? { visibility: 'hidden' } : undefined}>
    {volumeWorks(items, page, desktop).map((work) => <MountedWork key={work.item.id} {...work} desktop={desktop} open={open} />)}
  </ul>;
}

export function ToyGallery({ items, phase, returnControl }: { items: readonly GalleryItem[]; phase: StagePhase; returnControl: ReactNode }) {
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, () => false);
  const [view, setView] = useState<TurnView>(initialView);
  const pages = Math.max(1, Math.ceil(items.length / layout.pageSize));
  const currentPage = Math.min(view.page, pages - 1);
  const busy = view.status !== 'idle';
  const rootRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controller = useRef<ReturnType<typeof createGalleryDialog> | null>(null);
  const turn = useRef<ReturnType<typeof createGalleryTurn> | null>(null);
  const initialInput = useRef({ items, desktop, active: phase === 'open' });
  const phaseRef = useRef(phase);
  const titleId = useId();
  const first = String(currentPage * layout.pageSize + 1).padStart(2, '0');
  const last = String(Math.min(items.length, (currentPage + 1) * layout.pageSize)).padStart(2, '0');

  useEffect(() => {
    const root = rootRef.current, dialog = dialogRef.current;
    if (!root || !dialog) return;
    const turnInstance = createGalleryTurn({ root, dialog, input: initialInput.current, onChange: setView });
    turn.current = turnInstance;
    const instance = createGalleryDialog({
      dialog, gallery: root,
      title: dialog.querySelector<HTMLElement>('.toy-dialog-title')!,
      description: dialog.querySelector<HTMLElement>('.toy-description')!,
      notice: dialog.querySelector<HTMLElement>('.toy-sample-notice')!,
      videoBox: dialog.querySelector<HTMLElement>('.toy-video-box')!,
      video: dialog.querySelector<HTMLVideoElement>('video')!,
      missingVideo: dialog.querySelector<HTMLElement>('.toy-no-video')!,
      poster: dialog.querySelector<HTMLImageElement>('.toy-empty-poster')!,
      link: dialog.querySelector<HTMLAnchorElement>('.toy-project-link')!,
      missingLink: dialog.querySelector<HTMLElement>('.toy-no-project')!,
      error: dialog.querySelector<HTMLElement>('.toy-media-error')!,
      closeButton: dialog.querySelector<HTMLButtonElement>('.toy-dialog-close')!,
    }, () => phaseRef.current === 'open' && turnInstance.idle());
    controller.current = instance;
    return () => { turnInstance.destroy(); instance.destroy(); controller.current = null; turn.current = null; };
  }, []);

  useEffect(() => {
    const wasOpen = phaseRef.current === 'open';
    phaseRef.current = phase;
    turn.current?.update({ items, desktop, active: phase === 'open' });
    if (phase !== 'open') controller.current?.close(false);
    else if (!wasOpen) rootRef.current?.querySelector<HTMLButtonElement>('.leisure-reveal-return')?.focus({ preventScroll: true });
  }, [items, desktop, phase]);

  useLayoutEffect(() => { turn.current?.startAnimation(); }, [view.incoming, view.status]);

  const open = (item: GalleryItem, button: HTMLButtonElement) => controller.current?.open(item, button);
  return (
    <section ref={rootRef} className={`toy-gallery ${desktop ? 'toy-gallery--wall' : 'toy-gallery--compact'}`} aria-label="玩具册页展示"
      inert={phase !== 'open'} data-turn={view.status}>
      <div className="toy-gallery-map">
        {items.length ? <div className="toy-exhibits" aria-busy={busy}>
          <Volume key={currentPage} items={items} page={currentPage} desktop={desktop} incoming={false} busy={busy} open={open} />
          {view.incoming !== null ? <Volume key={view.incoming} items={items} page={view.incoming} desktop={desktop} incoming busy open={open} /> : null}
        </div> : <p className="toy-gallery-empty">此间留白，待新作。</p>}
      </div>
      <div className="toy-controls">
        <div className="toy-return-slot">{returnControl}</div>
        {pages > 1 ? <nav className="toy-volume-nav" aria-label="作品分卷">
          <button className="toy-previous-volume" type="button" onClick={() => { void turn.current?.previous(); }}
            disabled={currentPage === 0} aria-disabled={busy || currentPage === 0}>前卷</button>
          <span className="toy-volume-count" aria-label={`第 ${currentPage + 1} 卷，共 ${pages} 卷，当前第 ${first} 至 ${last} 件`}>
            <span className="toy-volume-seal" aria-hidden="true">{volumeNumerals[currentPage] ?? currentPage + 1}</span>
            <span className="toy-volume-range">{first}—{last} / {items.length}</span>
          </span>
          <button className="toy-next-volume" type="button" onClick={() => { void turn.current?.nextBatch(); }} aria-disabled={busy}
            title={currentPage === pages - 1 ? '重展第一卷' : '展开下一卷'}>
            <span>{view.status === 'loading' ? '备卷中' : view.status === 'animating' ? '展卷中' : '再展一卷'}</span><span aria-hidden="true">→</span>
          </button>
        </nav> : null}
        <p className="toy-volume-error" role="alert" hidden={!view.error}>{view.error}</p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{view.message}</p>
      <dialog ref={dialogRef} className="toy-dialog" aria-labelledby={titleId}>
        <header className="toy-dialog-head">
          <h2 id={titleId} className="toy-dialog-title" />
          <button type="button" className="toy-dialog-close" aria-label="关闭演示">×</button>
        </header>
        <div className="toy-dialog-main">
          <div className="toy-video-box">
            <video className="toy-video" controls playsInline preload="none" aria-label="作品演示视频" hidden />
            <div className="toy-no-video">
              {/* The controller owns this optional poster URL; media is attached only on open. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="toy-empty-poster" alt="" />
              <p>尚未提供演示视频</p>
            </div>
          </div>
          <div className="toy-dialog-aside">
            <p className="toy-description" />
            <p className="toy-sample-notice" hidden />
            <a className="toy-project-link" target="_blank" rel="noopener noreferrer" hidden>前往项目网站 ↗</a>
            <p className="toy-no-project">项目网站尚未配置</p>
            <p className="toy-media-error" role="status" />
          </div>
        </div>
      </dialog>
    </section>
  );
}
