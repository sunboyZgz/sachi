'use client';

import { useRef, useState, type ComponentPropsWithoutRef } from 'react';

export function ResourceVideo(props: ComponentPropsWithoutRef<'video'>) {
  const video = useRef<HTMLVideoElement>(null);
  const [failedSource, setFailedSource] = useState<ComponentPropsWithoutRef<'video'>['src']>();
  const failed = failedSource !== undefined && failedSource === props.src;
  return <>
    <video {...props} ref={video} onError={(event) => { setFailedSource(props.src); props.onError?.(event); }} onLoadedMetadata={(event) => { setFailedSource(undefined); props.onLoadedMetadata?.(event); }} />
    {failed ? <span role="status" className="resource-failure">视频暂时无法读取，正文可继续阅读。<button type="button" onClick={() => { setFailedSource(undefined); video.current?.load(); }}>重试</button></span> : null}
  </>;
}
