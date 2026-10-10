import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ExampleReading } from './ExampleReading';
import type { BlogExampleInput } from './example-types';

export function mountExample(frame: HTMLIFrameElement, input: BlogExampleInput) {
  const document = frame.contentDocument;
  const host = document?.getElementById('example-reading');
  if (!document || !host) throw new Error('示例阅读框尚未就绪。');
  const resize = () => { frame.style.height = `${Math.ceil(document.body.getBoundingClientRect().height) + 2}px`; };
  const observer = new ResizeObserver(resize); observer.observe(document.body);
  const root = hydrateRoot(host, createElement(ExampleReading, { input }));
  document.documentElement.classList.remove('example-no-js');
  // Fragment links stay in the isolated reading frame instead of loading the handbook again.
  const jump = (event: MouseEvent) => {
    const target = event.target;
    const anchor = target && 'closest' in target ? (target as HTMLElement).closest('a') : null;
    if (!anchor?.getAttribute('href')?.startsWith('#')) return;
    const section = document.getElementById(decodeURIComponent(anchor.getAttribute('href')!.slice(1)));
    if (section) { event.preventDefault(); section.scrollIntoView({ block: 'start', behavior: 'auto' }); }
  };
  document.addEventListener('click', jump);
  resize();
  return () => { document.removeEventListener('click', jump); observer.disconnect(); root.unmount(); };
}
