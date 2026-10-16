'use client';

import { useState, type ComponentPropsWithoutRef, type Ref } from 'react';
import { imageWindowStyle, type ImageWindow } from '../lib/image-window';

/** Crop only the visible viewport; source pixels and the source file remain intact. */
export function ImageWindowImage({ window, imageRef, displayWidth, ...props }: ComponentPropsWithoutRef<'img'> & { window?: ImageWindow; imageRef?: Ref<HTMLImageElement>; displayWidth?: number }) {
  const [failedSource, setFailedSource] = useState<ComponentPropsWithoutRef<'img'>['src']>();
  const [loaded, setLoaded] = useState<{ src: ComponentPropsWithoutRef<'img'>['src']; width: number; height: number }>();
  const dimensions = Number(props.width) > 0 && Number(props.height) > 0 ? { width: Number(props.width), height: Number(props.height) } : loaded?.src === props.src ? loaded : undefined;
  const markers = Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-source-')));
  /* eslint-disable @next/next/no-img-element */
  const image = <img {...props} alt={props.alt ?? ''} {...(window ? Object.fromEntries(Object.keys(markers).map((key) => [key, undefined])) : {})} ref={imageRef} onError={(event) => { setFailedSource(props.src); props.onError?.(event); }} onLoad={(event) => {
    setFailedSource(undefined);
    if (window) setLoaded({ src: props.src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
    props.onLoad?.(event);
  }} style={window && dimensions ? { ...props.style, ...imageWindowStyle(window) } : props.style} />;
  /* eslint-enable @next/next/no-img-element */
  const failure = failedSource !== undefined && failedSource === props.src ? <span role="status" className="resource-failure">图片暂时无法读取，正文可继续阅读。</span> : null;
  if (!window) return <>{image}{failure}</>;
  return <span {...markers} className={`markdown-image-window${props.className === 'flow-inline-image' ? ' flow-inline-image-window' : ''}`} data-image-window={JSON.stringify(window)} style={dimensions ? {
    width: `min(100%, ${displayWidth ?? dimensions.width * window.width}px)`, aspectRatio: `${dimensions.width * window.width} / ${dimensions.height * window.height}`,
  } : undefined}>{image}{failure}</span>;
}
