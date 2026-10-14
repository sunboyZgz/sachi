import type { Metadata } from 'next';
import Image from 'next/image';
import { SiteLink as Link } from '@/components/SiteLink';
import { Arrow } from '@/components/Arrow';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { categories } from '@/config/site';
import { getAllPosts } from '@/lib/content';
import { pageMetadata } from '@/lib/seo';
import { profile } from '@/config/site';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({ path: '/contents/', title: '目录', description: `${profile.name}的文章目录：${categories.map((category) => category.name).join('、')}。` });
}

export default async function ContentsPage() {
  const posts = await getAllPosts();
  return (
    <div className="directory frame">
      <Header showAvatar />
      <main id="main" tabIndex={-1}>
        <div className="index-heading">
          <h1 className="section-title">目录</h1>
          <span className="micro">三个栏目</span>
        </div>
        <div className="directory-grid">
          {categories.map((category) => {
            const entries = posts.filter((post) => post.category === category.id);
            const featured = entries.find((post) => post.featured) ?? entries[0];
            const ordinary = entries.filter((post) => post.slug !== featured?.slug).slice(0, 2);
            return (
              <section className="directory-column" aria-labelledby={`column-${category.id}`} key={category.id}>
                <p className="column-number">{category.number}</p>
                <h2 className="column-title" id={`column-${category.id}`}>
                  <Link href={`/category/${category.id}/`}>{category.name}</Link>
                </h2>
                <div className="column-rule" aria-hidden="true" />
                <div className="directory-content">
                  {featured ? (
                    <>
                      <div className="featured-entry">
                        <Link href={`/article/${featured.slug}/`}>
                          <span className="entry-kind">精选</span>
                          <h3>{featured.title}</h3>
                        </Link>
                        <Link href={`/article/${featured.slug}/`} tabIndex={-1} aria-hidden="true">
                          <Image src={featured.cover ?? category.image} alt="" width={112} height={98} loading="eager" />
                        </Link>
                      </div>
                      <ul className="plain-entries">
                        {ordinary.map((post) => (
                          <li key={post.slug}>
                            <Link href={`/article/${post.slug}/`}>
                              <span>{post.title}</span><Arrow />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="directory-empty">这里还没有公开文章。</p>
                  )}
                </div>
                <Link className="quiet-link column-all" href={`/category/${category.id}/`}>
                  查看全部 <Arrow />
                </Link>
              </section>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}
