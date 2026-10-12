'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SourceAttributes } from '../lib/source-lines';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function CodeBlock({ children, source }: { children: ReactNode; source?: SourceAttributes }) {
  // The server and initial hydration render agree; no-JS readers get only code.
  const ready = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const codeRef = useRef<HTMLPreElement>(null);
  const activeRef = useRef(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      if (resetRef.current !== null) clearTimeout(resetRef.current);
    };
  }, []);

  async function copy() {
    if (resetRef.current !== null) clearTimeout(resetRef.current);
    setStatus('copying');
    try {
      const text = codeRef.current?.textContent;
      if (text == null || !navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (!activeRef.current) return;
      setStatus('copied');
      resetRef.current = setTimeout(() => setStatus('idle'), 2000);
    } catch {
      if (activeRef.current) setStatus('error');
    }
  }

  return (
    <div {...source} className="code-block">
      <button
        className="code-copy"
        type="button"
        hidden={!ready}
        disabled={!ready || status === 'copying'}
        aria-label="复制代码"
        onClick={copy}
      >
        {status === 'copied' ? '已复制' : status === 'error' ? '复制失败' : status === 'copying' ? '复制中…' : '复制'}
      </button>
      <pre ref={codeRef}>{children}</pre>
      <span className={status === 'error' ? 'code-copy-feedback' : 'sr-only'} role="status" aria-live="polite">
        {status === 'copied' ? '代码已复制。' : status === 'error' ? '无法复制，请选中代码手动复制。' : ''}
      </span>
    </div>
  );
}
