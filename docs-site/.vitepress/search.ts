// VitePress serializes this function for the browser: keep every dependency local.
export function tokenizeChinese(text: string): string[] {
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
  return [...segmenter.segment(text)].filter((part) => part.isWordLike).map((part) => part.segment);
}
