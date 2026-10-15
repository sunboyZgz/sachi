import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { fullImageWindow, isFullImageWindow, normalizeImageWindow, type ImageCropTarget, type ImageWindow } from '../../../src/lib/image-window';
import type { ImageWindowReceipt } from './protocol';

type Handle = 'draw' | 'move' | 'nw' | 'ne' | 'sw' | 'se';
type Point = { x: number; y: number };
type Drag = { id: number; handle: Handle; start: Point; window: ImageWindow };
const percent = (value: number) => String(Math.round(value * 10000) / 100);

function NumberField({ label, value, update, disabled }: { label: string; value: number; update: (value: number) => void; disabled: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  return <label>{label}<span><input type="number" min="0" max="100" step="0.1" disabled={disabled} value={editing ?? percent(value)}
    onFocus={() => setEditing(percent(value))} onChange={(event) => setEditing(event.target.value)}
    onBlur={() => { if (editing?.trim() && Number.isFinite(Number(editing))) update(Number(editing) / 100); setEditing(null); }}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />%</span></label>;
}

export function ImageCropDialog({ target, apply, close }: { target: ImageCropTarget; apply: (value: ImageWindow) => Promise<ImageWindowReceipt>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | undefined>(undefined);
  const [window, setWindow] = useState(target.window ?? fullImageWindow);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => { if (node.open) node.close(); };
  }, []);
  const point = (event: PointerEvent): Point => {
    const rect = stage.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const begin = (event: PointerEvent, handle: Handle) => {
    if (event.button !== 0 || !size || busy) return;
    event.preventDefault(); event.stopPropagation();
    stage.current!.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, handle, start: point(event), window };
  };
  const resize = (original: ImageWindow, handle: Handle, dx: number, dy: number) => {
    if (handle === 'move') return normalizeImageWindow({ ...original, x: original.x + dx, y: original.y + dy });
    let left = original.x, top = original.y, right = left + original.width, bottom = top + original.height;
    if (handle.includes('w')) left = Math.max(0, Math.min(right - .001, left + dx));
    if (handle.includes('e')) right = Math.min(1, Math.max(left + .001, right + dx));
    if (handle.includes('n')) top = Math.max(0, Math.min(bottom - .001, top + dy));
    if (handle.includes('s')) bottom = Math.min(1, Math.max(top + .001, bottom + dy));
    return normalizeImageWindow({ x: left, y: top, width: right - left, height: bottom - top });
  };
  const move = (event: PointerEvent) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const current = point(event);
    setWindow(active.handle === 'draw' ? normalizeImageWindow({ x: Math.min(active.start.x, current.x), y: Math.min(active.start.y, current.y), width: Math.abs(current.x - active.start.x), height: Math.abs(current.y - active.start.y) })
      : resize(active.window, active.handle, current.x - active.start.x, current.y - active.start.y));
  };
  const end = (event: PointerEvent) => {
    drag.current = undefined;
    if (stage.current?.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);
  };
  const preset = (ratio: number) => {
    if (!size) return;
    const normalized = ratio / (size.width / size.height);
    let width = window.width, height = width / normalized;
    if (height > 1) { height = 1; width = normalized; }
    setWindow(normalizeImageWindow({ x: window.x + window.width / 2 - width / 2, y: window.y + window.height / 2 - height / 2, width, height }));
  };
  const keyboard = (event: KeyboardEvent, handle: Handle) => {
    const offsets: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const offset = offsets[event.key];
    if (!offset || busy) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? .05 : .01;
    setWindow((current) => resize(current, handle, offset.x * step, offset.y * step));
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await apply(window);
      if (result.accepted) close(); else setError(result.message);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="image-crop-dialog" data-preview-control="true" aria-labelledby="image-crop-title" onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}>
    <header><h2 id="image-crop-title">裁剪图片可视窗口</h2><p>{target.label}</p></header>
    <p className="image-crop-help">拖出窗口，拖动框内移动，用角点调整大小。方向键也可微调；原图片保留完整内容。</p>
    <div className="image-crop-stage" ref={stage} style={size ? { width: `min(100%, ${Math.min(800, size.width, globalThis.innerHeight * .5 * size.width / size.height)}px)`, aspectRatio: `${size.width} / ${size.height}` } : undefined}
      onPointerDown={(event) => begin(event, 'draw')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = undefined; }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={target.url} alt="用于选择裁剪范围的完整原图" draggable={false} onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError('原图未能加载，请检查资源后重新打开裁剪。')} />
      {size ? <div className="image-crop-selection" tabIndex={0} role="region" aria-label="裁剪窗口；方向键移动，Shift 加速" style={{ left: `${window.x * 100}%`, top: `${window.y * 100}%`, width: `${window.width * 100}%`, height: `${window.height * 100}%` }}
        onPointerDown={(event) => begin(event, isFullImageWindow(window) ? 'draw' : 'move')} onKeyDown={(event) => keyboard(event, 'move')}>
        {(['nw', 'ne', 'sw', 'se'] as const).map((handle, index) => <button key={handle} type="button" className={`image-crop-handle image-crop-handle--${handle}`} aria-label={`调整${['左上', '右上', '左下', '右下'][index]}角；方向键缩放`} disabled={busy} onPointerDown={(event) => begin(event, handle)} onKeyDown={(event) => keyboard(event, handle)} />)}
      </div> : null}
    </div>
    <div className="image-crop-presets" aria-label="设置窗口比例">
      <button type="button" disabled={busy} onClick={() => setWindow(fullImageWindow)}>显示整图</button>
      <button type="button" disabled={!size || busy} onClick={() => preset(size!.width / size!.height)}>原图比例</button>
      {[1, 4 / 3, 16 / 9].map((ratio, index) => <button key={ratio} type="button" disabled={!size || busy} onClick={() => preset(ratio)}>{['1:1', '4:3', '16:9'][index]}</button>)}
    </div>
    <div className="image-crop-numbers">
      {(['x', 'y', 'width', 'height'] as const).map((field, index) => <NumberField key={field} disabled={busy} label={['左侧位置', '顶部位置', '窗口宽度', '窗口高度'][index]} value={window[field]} update={(value) => setWindow((current) => normalizeImageWindow({ ...current, [field]: value }))} />)}
    </div>
    {error ? <p className="image-crop-error" role="alert">{error}</p> : null}
    <footer><span>应用后写入文章配置，保存文章后网站使用相同窗口。</span><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="image-crop-apply" disabled={!size || busy} onClick={() => void save()}>{busy ? '正在应用…' : '应用窗口'}</button></footer>
  </dialog>;
}
