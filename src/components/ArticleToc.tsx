'use client';

import { useEffect, useRef, useState } from 'react';
import type { ArticleHeading } from '@/lib/markdown';

function TocList({ headings, mobile = false }: { headings: ArticleHeading[]; mobile?: boolean }) {
  const [current, setCurrent] = useState(headings[0]?.id ?? '');
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const nodes = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: '-6% 0px -68% 0px' },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [headings]);

  const list = (
    <ol>
      {headings.map((heading, index) => (
        <li key={heading.id}>
          <a
            href={`#${encodeURIComponent(heading.id)}`}
            aria-current={current === heading.id ? 'location' : undefined}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              detailsRef.current?.removeAttribute('open');
            }}
          >
            {String(index + 1).padStart(2, '0')} · {heading.text}
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
