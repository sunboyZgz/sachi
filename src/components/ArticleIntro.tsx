import { Fragment } from 'react';
import { dateLabel, getCategory } from '../config/site';
import type { BlogPost } from '../lib/blog/schema';

export function ArticleIntro({ post }: { post: BlogPost }) {
  const categoryName = getCategory(post.category)!.name;
  const items = [post.status, ...post.tags, ...(post.category === 'learn' ? [`约 ${post.minutes} 分钟`] : [])]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return <>
    <p className="article-category">{categoryName}</p>
    <h1 className="article-title">{post.title}</h1>
    <div className="meta">
      <time dateTime={post.date}>{dateLabel(post.date)}</time>
      {items.map((item, index) => <Fragment key={`${item}-${index}`}>
        <span className="separator" aria-hidden="true" />{item}
      </Fragment>)}
    </div>
  </>;
}
