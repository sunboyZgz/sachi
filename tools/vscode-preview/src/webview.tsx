import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ArticleIntro } from '../../../src/components/ArticleIntro';
import { ArticleProse } from '../../../src/components/ArticleProse';
import { AuthorSignatureView } from '../../../src/components/AuthorSignatureView';
import avatarHalf from '../../../src/assets/avatar/avatar-half.png';
import { parseMarkdown, type ParsedMarkdown } from '../../../src/lib/markdown';
import { automaticContour } from './auto-contour';
import { SourceFollower } from './source-follow';
import { SourceClick } from './source-click';
import { testClick } from './test-click';
import { sourceAttributes } from '../../../src/lib/source-lines';
import type { HostMessage, PreviewData, RenderMessage, ViewMessage } from './protocol';
import './webview.css';

declare function acquireVsCodeApi(): {
  postMessage(message: ViewMessage): void;
  getState(): { document: string; scroll: number } | undefined;
  setState(value: { document: string; scroll: number }): void;
};

const vscode = acquireVsCodeApi();
const container = document.getElementById('root')!;
const root = createRoot(container);
const follower = new SourceFollower(container, (receipt) => vscode.postMessage({ type: 'revealed', receipt }));
const sourceClick = new SourceClick(container, (request) => { follower.suspend(); vscode.postMessage(request); });
const packagedAvatar = new URL(String(avatarHalf), (document.currentScript as HTMLScriptElement).src).href;
let latest = 0;
let current: PreviewData | undefined;
let scrollFrame = 0;

class PreviewBoundary extends Component<{ children: ReactNode; data: PreviewData }, { failed: boolean; revision: number }> {
  state = { failed: false, revision: this.props.data.revision };
  static getDerivedStateFromProps(props: { data: PreviewData }, state: { revision: number }) {
    return props.data.revision !== state.revision ? { failed: false, revision: props.data.revision } : null;
  }
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <>
      <p className="preview-notice" role="alert">排版组件暂时不可用，下面保留完整正文。</p>
      <pre className="preview-fallback">{this.props.data.post.body.split('\n').map((line, index) => <span key={index} {...sourceAttributes({ start: { line: this.props.data.source.origin.lineOffset + index + 1, column: 1 }, end: { line: this.props.data.source.origin.lineOffset + index + 1, column: line.length + 1 } }, 'text')}>{line}{'\n'}</span>)}</pre>
    </>;
    return this.props.children;
  }
}

function Article({ data, parsed }: { data: PreviewData; parsed: ParsedMarkdown }) {
  return <>
    <div className="preview-status" role="status">实时预览<span>{data.dirty ? '含未保存修改' : '已保存'}</span></div>
    {data.warnings.length ? <aside className="preview-notice" role="status">{data.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</aside> : null}
    <main className="article-main preview-main">
      <div {...sourceAttributes({ start: { line: 1, column: 1 }, end: { line: Math.max(1, data.source.origin.lineOffset), column: 1 } }, 'metadata')}><ArticleIntro post={data.post} /></div>
      <div className="article-intro-rule" aria-hidden="true" />
      <PreviewBoundary key={data.document} data={data}>
        <ArticleProse parsed={parsed} assets={data.post.assets} flowKey={`${data.document}:${data.post.flow?.image}:${data.post.flow?.contour}`} />
      </PreviewBoundary>
      <AuthorSignatureView name={data.profile.name} bio={data.profile.bio} avatar={
        <span className="avatar-slot avatar-slot--signature" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="avatar-image" src={data.avatar || packagedAvatar} alt="" width={120} height={120} />
        </span>
      } />
      <div className="preview-end" aria-hidden="true" />
    </main>
  </>;
}

async function update(message: RenderMessage) {
  if (!message || !Number.isInteger(message.revision) || message.revision < latest) return;
  latest = message.revision;
  sourceClick.invalidate();
  if (message.type === 'error') {
    let notice = document.getElementById('preview-error');
    if (!notice) {
      notice = document.createElement('aside');
      notice.id = 'preview-error';
      notice.className = 'preview-notice';
      notice.setAttribute('role', 'alert');
      document.body.prepend(notice);
    }
    notice.textContent = `${message.message}  · 修正后自动刷新${current ? '，下方保留上一次有效预览。' : '。'}`;
    return;
  }
  if (message.type !== 'update') return;
  let data = message;
  const warnings = [...message.warnings];
  let flow = data.post.flow;
  if (flow && !flow.contour) {
    try { flow = { ...flow, contour: await automaticContour(flow.image) }; }
    catch (error) { flow = undefined; warnings.push(`环绕暂用普通排版：${error instanceof Error ? error.message : String(error)}`); }
  }
  if (latest !== message.revision) return;
  let parsed: ParsedMarkdown;
  try { parsed = parseMarkdown(data.post.body, flow, data.post.assets, data.source.origin); }
  catch (error) {
    warnings.push(`环绕暂用普通排版：${error instanceof Error ? error.message : String(error)}`);
    parsed = parseMarkdown(data.post.body, undefined, data.post.assets, data.source.origin);
  }
  data = { ...data, warnings };
  const saved = vscode.getState();
  const scroll = current?.document === data.document ? window.scrollY : saved?.document === data.document ? saved.scroll : 0;
  for (let index = 0; index < data.styles.length; index += 1) {
    const id = `project-style-${index}`;
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) { link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; document.head.append(link); }
    if (link.href !== data.styles[index]) link.href = data.styles[index];
  }
  document.getElementById('preview-error')?.remove();
  current = data;
  flushSync(() => root.render(<Article data={data} parsed={parsed} />));
  requestAnimationFrame(() => {
    if (latest !== data.revision) return;
    window.scrollTo({ top: scroll, behavior: 'instant' });
    vscode.setState({ document: data.document, scroll });
    sourceClick.setData(data);
    follower.rendered(data);
    vscode.postMessage({ type: 'rendered', receipt: { revision: data.revision, title: data.post.title, text: document.querySelector('main')?.textContent ?? '', flow: !!parsed.flow } });
  });
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message?.type === 'revealLine' && !sourceClick.waiting) follower.reveal(message);
  else if (message?.type === 'sync') { follower.setEnabled(message.enabled); sourceClick.setEnabled(message.clickEnabled); }
  else if (message?.type === 'sourceResult' && sourceClick.acknowledge(message.receipt)) follower.suspend(message.receipt.navigationSequence);
  else if (message?.type === 'testPreviewClick' && document.body.dataset.previewTest === 'true') {
    const found = testClick(container, message.action);
    vscode.postMessage({ type: 'previewClickTested', receipt: { sequence: message.sequence, found, scrollTop: window.scrollY, selectionCollapsed: document.getSelection()?.isCollapsed ?? true } });
  }
  else if (message?.type === 'inspectCodeStyles' && current) {
    vscode.postMessage({ type: 'codeStyles', receipt: {
      revision: current.revision, sequence: message.sequence, theme: document.body.dataset.vscodeThemeKind ?? '', scrollTop: window.scrollY,
      blocks: [...container.querySelectorAll<HTMLElement>('.article-prose pre code')].map((code) => ({
        language: [...code.classList].find((name) => name.startsWith('language-')) ?? '',
        text: code.textContent ?? '', color: getComputedStyle(code).color, background: getComputedStyle(code.closest('pre')!).backgroundColor,
        tokens: Object.fromEntries([...code.querySelectorAll<HTMLElement>('span[class]')].map((span) => [span.className, getComputedStyle(span).color])),
      })),
      inline: [...container.querySelectorAll<HTMLElement>('.article-prose :not(pre) > code')].map((code) => ({ text: code.textContent ?? '', color: getComputedStyle(code).color, parentColor: getComputedStyle(code.parentElement!).color })),
    } });
  }
  else if (message?.type === 'update' || message?.type === 'error') void update(message);
});
window.addEventListener('scroll', () => {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => { if (current) vscode.setState({ document: current.document, scroll: window.scrollY }); });
}, { passive: true });
document.addEventListener('click', (event) => {
  const anchor = event.target instanceof Element ? event.target.closest('a') : null;
  if (!anchor || anchor.getAttribute('href')?.startsWith('#')) return;
  event.preventDefault();
  const href = anchor.getAttribute('href');
  if (href) vscode.postMessage({ type: 'openLink', href });
});
root.render(<p className="preview-notice" role="status">正在读取文章…</p>);
vscode.postMessage({ type: 'ready' });
