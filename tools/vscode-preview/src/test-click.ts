import type { PreviewTestClick } from './protocol';

/** Development-only DOM gesture driver. All hit testing runs in the real Webview. */
export function testClick(root: HTMLElement, action: PreviewTestClick) {
  if (action.image) {
    const image = root.querySelector<HTMLElement>(action.selector ?? '.article-prose img');
    if (!image) return false;
    window.dispatchEvent(new WheelEvent('wheel'));
    image.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    document.getSelection()?.removeAllRanges();
    const options = { bubbles: true, button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerId: 1 };
    image.dispatchEvent(new PointerEvent('pointerdown', options));
    image.dispatchEvent(new PointerEvent('pointerup', options));
    image.dispatchEvent(new MouseEvent('click', { ...options, detail: 1 }));
    return true;
  }
  let occurrence = action.occurrence ?? 0;
  let target: Text | undefined;
  let offset = 0;
  for (const scope of root.querySelectorAll(action.selector ?? '.article-prose, .article-title')) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('.flow-block[data-layout="wrap"] .flow-original') || !node.parentElement?.getBoundingClientRect().height) continue;
      const text = node.textContent ?? '';
      let index = -1;
      while ((index = text.indexOf(action.text, index + 1)) >= 0) {
        if (!occurrence--) { target = node as Text; offset = index + (action.offset ?? 0); break; }
      }
      if (target) break;
    }
    if (target) break;
  }
  if (!target) return false;
  window.dispatchEvent(new WheelEvent('wheel'));
  target.parentElement!.scrollIntoView({ block: 'center', behavior: 'instant' });
  const glyph = document.createRange();
  glyph.setStart(target, offset); glyph.setEnd(target, Math.min(offset + 1, target.length));
  const rect = glyph.getClientRects()[0];
  if (!rect?.width) return false;
  const x = rect.left + Math.min(1, rect.width * .2), y = rect.top + rect.height * .5;
  const selection = document.getSelection();
  selection?.removeAllRanges();
  const element = target.parentElement!;
  const button = action.gesture === 'right' ? 2 : 0;
  const options = { bubbles: true, button, clientX: x, clientY: y, pointerId: 1 };
  element.dispatchEvent(new PointerEvent('pointerdown', options));
  if (action.gesture === 'drag') {
    element.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: x + 20 }));
    selection?.addRange(glyph);
  }
  element.dispatchEvent(new PointerEvent('pointerup', options));
  element.dispatchEvent(new MouseEvent('click', { ...options, detail: 1 }));
  return true;
}
