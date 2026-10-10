import { SiteLink as Link } from '@/components/SiteLink';
import type { SeriesWithPosts } from '@/lib/blog/series';

export function SeriesNavigation({ series, postId }: { series: SeriesWithPosts; postId: string }) {
  const index = series.chapters.findIndex((post) => post.id === postId);
  const previous = series.chapters[index - 1];
  const next = series.chapters[index + 1];
  return (
    <nav className="series-navigation" aria-label="系列阅读导航">
      <div>{previous ? <Link href={`/article/${previous.slug}/`}><span className="series-nav-label">← 上一篇</span><span>{previous.title}</span></Link> : null}</div>
      <Link className="series-nav-index" href={`/series/${series.slug}/`}>系列目录</Link>
      <div className="series-nav-next">{next ? <Link href={`/article/${next.slug}/`}><span className="series-nav-label">下一篇 →</span><span>{next.title}</span></Link> : null}</div>
    </nav>
  );
}
