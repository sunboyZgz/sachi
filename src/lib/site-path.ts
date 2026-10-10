/** Prefix local URLs only; leave fragments, relative URLs and other origins alone. */
export function withBasePath(url: string, basePath: string) {
  if (!basePath || !url.startsWith('/') || url.startsWith('//')) return url;
  if (url === basePath || url.startsWith(`${basePath}/`) || url.startsWith(`${basePath}?`) || url.startsWith(`${basePath}#`)) return url;
  return `${basePath}${url}`;
}

export function sitePath(url: string) {
  return withBasePath(url, process.env.NEXT_PUBLIC_BLOG_BASE_PATH ?? '');
}
