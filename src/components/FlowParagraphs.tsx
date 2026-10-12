'use client';

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  LayoutCursor,
  PreparedTextWithSegments,
} from '@chenglou/pretext';
import { availableIntervals, clampPosition, flowImageSize, isContour, type Contour, type Position } from '../lib/flow-geometry';
import type { FlowPresentation } from '../lib/markdown';
import { cursorOffsetLookup, sourceAttributes, sourceRangeForOffsets, type FlowSourceMap, type SourceLine } from '../lib/source-lines';
import { joinSourceMaps, normalizeSourceMap, sliceSourceMap, sourceMapAttributes } from '../lib/source-text-map';

const lineHeight = 36;

type DragState = { x: number; y: number; origin: Position };

function mappedText(text: string, lines?: SourceLine[]) {
  if (!lines) return text;
  return lines.map((line, index) => <Fragment key={index}>
    {index ? '\n' : null}<span {...sourceAttributes(line.range, 'text')} {...sourceMapAttributes(line.points)} data-source-line={line.range.start.line}>{line.text}</span>
  </Fragment>);
}

export function FlowParagraphs({ paragraphs, hardLines, source, spec }: { paragraphs: string[]; hardLines?: string[][]; source?: FlowSourceMap; spec: FlowPresentation }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const paintRef = useRef<HTMLDivElement>(null);
  const obstacleRef = useRef<HTMLButtonElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageSizeRef = useRef({ width: spec.width ?? 205, height: 0 });
  const positionRef = useRef<Position>({ x: 0, y: spec.defaultY });
  const widthRef = useRef(0);
  const manualRef = useRef(false);
  const activeRef = useRef(false);
  const plainRef = useRef(false);
  const failedRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const scheduleRef = useRef<() => void>(() => undefined);
  const [interactive, setInteractive] = useState(false);
  const [plain, setPlain] = useState(false);
  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState<'inline' | 'wrap'>('inline');

  useEffect(() => {
    activeRef.current = interactive;
  }, [interactive]);

  useEffect(() => {
    plainRef.current = plain;
    scheduleRef.current();
  }, [plain]);

  useEffect(() => {
    let destroyed = false;
    let animationFrame = 0;
    let contour: Contour | null = null;
    let engine: typeof import('@chenglou/pretext') | null = null;
    let loadingEngine = false;
    let prepared: PreparedTextWithSegments[][] = [];
    let cursorOffsets: Array<Array<ReturnType<typeof cursorOffsetLookup>>> = [];
    let fontKey = '';
    const controller = new AbortController();

    const showPlainFallback = (error?: unknown) => {
      if (error) {
        console.warn('Pretext 环绕不可用，已退回普通 DOM 排版。', error);
        failedRef.current = true;
        setFailed(true);
      }
      setLayout('inline');
      const stage = stageRef.current;
      const paint = paintRef.current;
      if (stage) stage.style.height = 'auto';
      if (paint) paint.replaceChildren();
    };

    const relayout = () => {
      if (destroyed) return;
      const stage = stageRef.current;
      const paint = paintRef.current;
      const obstacleNode = obstacleRef.current;
      if (!stage || !paint || !obstacleNode || !contour) return;

      try {
        const width = stage.clientWidth;
        widthRef.current = width;
        const inline = width < 520 || window.matchMedia('(max-width: 600px)').matches || plainRef.current || failedRef.current;
        if (inline) {
          showPlainFallback();
          return;
        }

        if (!engine) {
          if (!loadingEngine) {
            loadingEngine = true;
            import('@chenglou/pretext').then((module) => {
              if (destroyed) return;
              engine = module;
              engine.setLocale('zh-CN');
              schedule();
            }).catch((error: unknown) => { if (!destroyed) showPlainFallback(error); });
          }
          return;
        }

        setLayout('wrap');
        const style = getComputedStyle(stage);
        const font = `${style.fontStyle} ${style.fontWeight} 18px ${style.fontFamily}`;
        if (font !== fontKey) {
          prepared = paragraphs.map((paragraph, index) => (hardLines?.[index] ?? [paragraph]).map((line) => engine!.prepareWithSegments(line, font)));
          if (source) cursorOffsets = prepared.map((chunks) => chunks.map((chunk) => cursorOffsetLookup(chunk.segments)));
          fontKey = font;
        }
        const { width: imageWidth, height: imageHeight } = imageSizeRef.current;
        if (!manualRef.current) {
          positionRef.current = {
            x: width * spec.defaultX - imageWidth / 2,
            y: spec.defaultY,
          };
        }
        const position = clampPosition(positionRef.current, width, imageWidth);
        positionRef.current = position;
        const obstacle = { ...position, width: imageWidth, height: imageHeight };
        obstacleNode.style.cssText = `left:${position.x}px;top:${position.y}px;width:${imageWidth}px;height:${imageHeight}px;`;

        const fragment = document.createDocumentFragment();
        let y = 0;
        let total = 0;
        for (let paragraphIndex = 0; paragraphIndex < prepared.length; paragraphIndex += 1) {
          let guard = 0;
          for (let hardLineIndex = 0; hardLineIndex < prepared[paragraphIndex].length; hardLineIndex += 1) {
            const sourceLines = source?.paragraphs[paragraphIndex]?.[hardLineIndex];
            const sourceMap = sourceLines?.every((line) => line.points) ? normalizeSourceMap(joinSourceMaps(sourceLines.map((line) => ({ text: line.text, points: line.points! })), '\n')) : undefined;
            if (hardLines?.[paragraphIndex]?.[hardLineIndex]?.trim() === '') {
              if (sourceLines?.[0]) {
                const anchor = document.createElement('span');
                anchor.className = 'flow-source-anchor';
                for (const [key, value] of Object.entries(sourceAttributes(sourceLines[0].range, 'flow'))) anchor.setAttribute(key, String(value));
                anchor.style.cssText = `position:absolute;left:0;top:${y}px;width:1px;height:${lineHeight}px;`;
                fragment.append(anchor);
              }
              y += lineHeight;
              continue;
            }
            const current = prepared[paragraphIndex][hardLineIndex];
            let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
            let done = false;
            while (!done && guard < 2000) {
              guard += 1;
              const regions = availableIntervals(width, y, lineHeight, obstacle, contour);
              let placedInRow = false;
              for (const region of regions) {
                const range = engine.layoutNextLineRange(current, cursor, region.width);
                if (!range) {
                  done = true;
                  break;
                }
                const line = engine.materializeLineRange(current, range);
                const node = document.createElement('span');
                node.className = 'flow-fragment';
                node.textContent = line.text;
                node.style.cssText = `left:${region.x}px;top:${y}px;`;
                node.dataset.room = region.width.toFixed(2);
                node.dataset.paragraph = String(paragraphIndex);
                if (sourceLines) {
                  const offset = cursorOffsets[paragraphIndex][hardLineIndex];
                  const range = sourceRangeForOffsets(sourceLines, offset(line.start), offset(line.end));
                  for (const [key, value] of Object.entries(sourceAttributes(range, 'flow'))) node.setAttribute(key, String(value));
                  if (sourceMap) for (const [key, value] of Object.entries(sourceMapAttributes(sliceSourceMap(sourceMap, offset(line.start), offset(line.end), line.text).points))) node.setAttribute(key, value);
                }
                fragment.append(node);
                total += 1;
                cursor = line.end;
                placedInRow = true;
              }
              if (!done || placedInRow) y += lineHeight;
            }
            if (guard >= 2000) throw new Error('环绕布局未能结束。');
          }
          y += lineHeight * 0.55;
        }
        paint.replaceChildren(fragment);
        stage.style.height = `${Math.ceil(Math.max(y, position.y + imageHeight) + 5)}px`;
        stage.dataset.fragmentCount = String(total);
      } catch (error) {
        showPlainFallback(error);
      }
    };

    const schedule = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(relayout);
    };
    scheduleRef.current = schedule;

    const onFonts = () => {
      engine?.clearCache();
      fontKey = '';
      schedule();
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const initialize = async () => {
      if (!spec.contour) throw new Error('环绕图片没有可用轮廓。');
      const response = await fetch(spec.contour, { signal: controller.signal });
      if (!response.ok) throw new Error('环绕轮廓文件未能加载。');
      const value: unknown = await response.json();
      if (!isContour(value)) throw new Error('环绕轮廓格式无效。');
      contour = value;
      const image = imageRef.current;
      if (!image) throw new Error('环绕图片未能加载。');
      await image.decode();
      if (destroyed) return;
      imageSizeRef.current = flowImageSize(spec.width, image.naturalWidth, image.naturalHeight);
      await document.fonts.ready;
      if (destroyed) return;
      if (stageRef.current) observer?.observe(stageRef.current);
      window.addEventListener('resize', schedule);
      document.fonts.addEventListener('loadingdone', onFonts);
      relayout();
    };
    initialize().catch((error: unknown) => {
      if (!controller.signal.aborted) showPlainFallback(error);
    });

    return () => {
      destroyed = true;
      controller.abort();
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      document.fonts.removeEventListener('loadingdone', onFonts);
      scheduleRef.current = () => undefined;
    };
  }, [paragraphs, hardLines, source, spec.contour, spec.image, spec.width, spec.defaultX, spec.defaultY]);

  const moveTo = (position: Position) => {
    manualRef.current = true;
    positionRef.current = clampPosition(position, widthRef.current, imageSizeRef.current.width);
    scheduleRef.current();
  };

  return (
    <section
      className="flow-block"
      data-engine={failed ? 'plain-dom' : 'pretext'}
      data-layout={layout}
      aria-label="图文环绕段落"
      style={{ '--flow-image-width': `${spec.width ?? 180}px` } as CSSProperties}
    >
      <div className="flow-canvas" ref={stageRef}>
        <div className={`flow-original ${layout === 'wrap' ? 'sr-only' : 'flow-fallback'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...sourceAttributes(source?.image, 'image')} ref={imageRef} className="flow-inline-image" src={spec.image} alt={spec.alt} width={spec.imageWidth} height={spec.imageHeight} />
          {paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph}`} {...sourceAttributes(source ? {
            start: source.paragraphs[index][0][0].range.start,
            end: source.paragraphs[index].at(-1)!.at(-1)!.range.end,
          } : undefined, 'flow-paragraph')}>
            {hardLines?.[index] ? hardLines[index].map((line, lineIndex) => <Fragment key={lineIndex}>
              {lineIndex ? <br /> : null}{mappedText(line, source?.paragraphs[index]?.[lineIndex])}
            </Fragment>) : mappedText(paragraph, source?.paragraphs[index]?.[0])}
          </p>)}
        </div>
        <div className="flow-visual" hidden={layout !== 'wrap'}>
          <div className="flow-text" ref={paintRef} aria-hidden="true" />
          <button
            {...sourceAttributes(source?.image, 'image')}
            ref={obstacleRef}
            type="button"
            className="flow-obstacle"
            aria-label={`移动环绕图片${spec.alt ? `：${spec.alt}` : ''}；开启互动后也可用方向键移动`}
            disabled={!interactive || failed}
            data-interactive={interactive && !failed ? 'true' : 'false'}
            onPointerDown={(event) => {
              if (!activeRef.current) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = {
                x: event.clientX,
                y: event.clientY,
                origin: { ...positionRef.current },
              };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || !activeRef.current) return;
              moveTo({
                x: drag.origin.x + event.clientX - drag.x,
                y: drag.origin.y + event.clientY - drag.y,
              });
            }}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerCancel={() => { dragRef.current = null; }}
            onKeyDown={(event) => {
              const offsets: Partial<Record<string, [number, number]>> = {
                ArrowLeft: [-12, 0],
                ArrowRight: [12, 0],
                ArrowUp: [0, -12],
                ArrowDown: [0, 12],
              };
              const offset = offsets[event.key];
              if (!activeRef.current || !offset) return;
              event.preventDefault();
              moveTo({
                x: positionRef.current.x + offset[0],
                y: positionRef.current.y + offset[1],
              });
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spec.image} alt="" width={spec.imageWidth} height={spec.imageHeight} draggable={false} />
          </button>
        </div>
      </div>
      <div className="flow-controls">
        <span className="flow-status">{failed ? '普通排版 · Pretext 不可用' : 'Pretext 0.0.9'}</span>
        <button
          type="button"
          aria-pressed={interactive}
          disabled={failed}
          onClick={() => setInteractive((value) => !value)}
        >
          {interactive ? '关闭互动' : '开启互动'}
        </button>
        <button
          type="button"
          disabled={failed}
          onClick={() => {
            manualRef.current = false;
            scheduleRef.current();
          }}
        >还原位置</button>
        <button type="button" aria-pressed={plain} disabled={failed} onClick={() => setPlain((value) => !value)}>
          {plain ? '恢复环绕' : '普通排版'}
        </button>
      </div>
      <p className="flow-help" hidden={!interactive || failed}>
        拖动图片，或聚焦图片后使用方向键。正文不会自动移动。
      </p>
    </section>
  );
}
