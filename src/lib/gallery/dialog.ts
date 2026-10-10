import type { GalleryItem } from './types';

type DialogElements = {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  description: HTMLElement;
  notice: HTMLElement;
  videoBox: HTMLElement;
  video: HTMLVideoElement;
  missingVideo: HTMLElement;
  poster: HTMLImageElement;
  link: HTMLAnchorElement;
  missingLink: HTMLElement;
  error: HTMLElement;
  closeButton: HTMLButtonElement;
  gallery: HTMLElement;
};

/** Media is only attached while the native dialog is open. No extra scroll lock. */
export function createGalleryDialog(elements: DialogElements, canOpen: () => boolean) {
  const { dialog, video, closeButton, gallery } = elements;
  const events = new AbortController();
  let opener: HTMLElement | null = null, activeId: string | null = null, disposed = false;
  let pointerOutside = false;

  function releaseMedia() {
    video.pause();
    video.removeAttribute('src');
    video.removeAttribute('poster');
    video.load();
  }

  function close(restoreFocus = true) {
    const id = activeId;
    activeId = null;
    releaseMedia();
    if (dialog.open) dialog.close();
    if (restoreFocus && id && canOpen() && !document.hidden) {
      const target = opener?.isConnected ? opener : [...gallery.querySelectorAll<HTMLButtonElement>('.toy-cover-button')].find((node) => node.dataset.workId === id);
      target?.focus({ preventScroll: true });
    }
    opener = null;
  }

  function open(item: GalleryItem, button: HTMLButtonElement) {
    if (disposed || !canOpen() || dialog.open) return;
    activeId = item.id;
    opener = button;
    elements.title.textContent = item.title;
    elements.description.textContent = item.description ?? '';
    elements.notice.textContent = [item.demoOnly ? '界面示例，不代表已完成的真实作品。' : '', item.videoLabel].filter(Boolean).join(' ');
    elements.notice.hidden = !elements.notice.textContent;
    elements.error.textContent = '';
    elements.link.hidden = !item.projectUrl;
    elements.missingLink.hidden = !!item.projectUrl;
    if (item.projectUrl) elements.link.href = item.projectUrl;
    else elements.link.removeAttribute('href');
    video.hidden = !item.video;
    elements.missingVideo.hidden = !!item.video;
    if (item.cover) {
      video.poster = item.cover;
      elements.poster.src = item.cover;
    } else elements.poster.removeAttribute('src');
    if (item.video) { video.src = item.video; video.preload = 'metadata'; }
    try {
      dialog.showModal();
      closeButton.focus({ preventScroll: true });
    } catch { close(); }
  }

  const outside = (event: PointerEvent | MouseEvent) => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  const { signal } = events;
  closeButton.addEventListener('click', () => close(), { signal });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); }, { signal });
  dialog.addEventListener('close', () => { if (activeId && !dialog.open) close(); }, { signal });
  dialog.addEventListener('pointerdown', (event) => { pointerOutside = event.target === dialog && outside(event); }, { signal });
  dialog.addEventListener('click', (event) => {
    if (pointerOutside && event.target === dialog && outside(event)) close();
    pointerOutside = false;
  }, { signal });
  video.addEventListener('error', () => {
    if (activeId && video.getAttribute('src')) elements.error.textContent = '视频暂时无法播放，请检查地址、编码或网络。';
  }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(false); }, { signal });
  window.addEventListener('pagehide', () => close(false), { signal });
  window.addEventListener('beforeprint', () => close(false), { signal });

  return { open, close, destroy() { disposed = true; close(false); events.abort(); } };
}
