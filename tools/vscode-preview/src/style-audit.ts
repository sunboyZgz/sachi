/** Computed styles from the actual DOM, shared by browser and Extension Host checks. */
export function inspectArticleStyles() {
  const selectors = ['.article-title', '.article-category', '.meta', '.article-intro-rule', '.article-prose', '.article-prose p', '.article-prose h1', '.article-prose h2', '.article-prose h3', '.article-prose h4', '.article-prose h5', '.article-prose h6', '.article-prose blockquote', '.article-prose em', '.article-prose strong', '.article-prose del', '.article-prose ul', '.article-prose ol', '.article-prose li', '.article-prose input', '.article-prose hr', '.article-prose a', '.article-prose pre', '.article-prose code', '.article-prose table', '.article-prose th', '.article-prose td', '.article-prose figure', '.article-prose img', '.article-prose figcaption', '.author-signature', '.author-signature-name', '.author-signature-bio'];
  const properties = ['display', 'color', 'background-color', 'font-family', 'font-size', 'font-style', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-decoration-line', 'white-space', 'list-style-type', 'border-collapse', 'border-top', 'border-right', 'border-bottom', 'border-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'max-height'];
  return Object.fromEntries(selectors.map((selector) => [selector, [...document.querySelectorAll(selector)].map((node) => {
    const style = getComputedStyle(node);
    return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
  })]));
}

export type ArticleStyles = ReturnType<typeof inspectArticleStyles>;
