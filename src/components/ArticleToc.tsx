'use client';

import { useEffect, useRef, useState } from 'react';
import type { ArticleHeading } from '@/lib/article-structure';

function TocList({ headings, mobile = false }: { headings: ArticleHeading[]; mobile?: boolean }) {
  const [current, setCurrent] = useState(headings[0]?.id ?? '');
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const nodes = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    let frame = 0;
    const fromScroll = () => {
      frame = 0;
      // Native anchors stop 38px from the top; a stacked child must not win early.
      const threshold = 48;
      let active: HTMLElement | undefined = nodes[0];
      for (const node of nodes) {
        if (node.getBoundingClientRect().top > threshold) break;
        active = node;
      }
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) active = nodes.at(-1);
      if (active) setCurrent(active.id);
    };
    const fromHash = () => {
      // Compare encoded fragments directly; malformed URL escapes stay harmless.
      const active = nodes.find((node) => `#${encodeURIComponent(node.id)}` === window.location.hash);
      if (active) setCurrent(active.id);
      else fromScroll();
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(fromScroll); };
    frame = requestAnimationFrame(() => { frame = 0; fromHash(); });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', fromHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('hashchange', fromHash);
    };
  }, [headings]);

  const list = (
    <ol>
      {headings.map((heading) => (
        <li key={heading.id} data-toc-level={heading.nesting}>
          <a
            href={`#${encodeURIComponent(heading.id)}`}
            aria-current={current === heading.id ? 'location' : undefined}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              detailsRef.current?.removeAttribute('open');
            }}
          >
            <span className="toc-number">{heading.number} · </span>{heading.text}
          </a>
        </li>
      ))}
    </ol>
  );

  if (mobile) {
    return (
      <details className="mobile-toc" ref={detailsRef}>
        <summary>本文目录</summary>
        {list}
      </details>
    );
  }
  return (
    <aside className="toc" aria-label="本文目录">
      <h2>目录</h2>
      {list}
    </aside>
  );
}

export function MobileArticleToc({ headings }: { headings: ArticleHeading[] }) {
  if (headings.length === 0) return null;
  return <TocList headings={headings} mobile />;
}

export function DesktopArticleToc({ headings }: { headings: ArticleHeading[] }) {
  if (headings.length === 0) return null;
  return <TocList headings={headings} />;
}
