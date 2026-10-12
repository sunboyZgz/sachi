import { Fragment } from 'react';
import { dateLabel, getCategory } from '../config/site';
import type { BlogPost } from '../lib/blog/schema';

export function ArticleIntro({ post }: { post: BlogPost }) {
  const categoryName = getCategory(post.category)!.name;
  const items = post.category === 'play' ? [post.status, ...post.tags]
    : post.category === 'learn' ? [categoryName, ...post.tags, `约 ${post.minutes} 分钟`] : [categoryName];
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
