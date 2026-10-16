import Image from 'next/image';
import type { CSSProperties } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AvatarImage } from '@/components/AvatarImage';
import { SiteLink } from '@/components/SiteLink';
import { WritingCalendar } from '@/components/WritingCalendar';
import { identity, dateLabel, getCategory } from '@/config/site';
import { getWritingActivity } from '@/lib/blog/activity';
import { indexCalendarPosts } from '@/lib/writing-calendar';
import { pageMetadata } from '@/lib/seo';
import { categoryNames } from '@/lib/blog/schema';
import bambooLeft from '@/assets/about/bamboo-left.webp';
import bambooRight from '@/assets/about/bamboo-right-rock.webp';
import leafSingle from '@/assets/about/leaf-single.webp';
import leafFaint from '@/assets/about/leaf-faint.webp';
import seal from '@/assets/about/seal.webp';
import leavesPair from '@/assets/about/leaves-pair.webp';
import teaBooks from '@/assets/about/tea-books.webp';
import grain from '@/assets/about/paper-grain.png';
import '@/styles/about.css';

export async function generateMetadata() {
  return pageMetadata({ path: '/about/', title: '关于我', description: `${identity.bio} 关于我的生活、近况与写作记录。` });
}

export default async function AboutPage() {
  const activity = await getWritingActivity();
  const days = indexCalendarPosts(activity.posts);
  const about = identity.about;
  return <div className="about-page" id="about-top" style={{ '--about-grain': `url("${grain.src}")` } as CSSProperties}>
    <div aria-hidden="true">
      <Image className="decoration bamboo-left" src={bambooLeft} alt="" loading="eager" />
      <Image className="decoration bamboo-right" src={bambooRight} alt="" loading="eager" />
      <Image className="decoration falling-leaf" src={leafSingle} alt="" />
      <Image className="decoration faint-leaf" src={leafFaint} alt="" />
      <aside className="aside-poem"><p>竹影随风<br />心向远方</p><Image src={seal} alt="" /></aside>
    </div>
    <div className="page">
      <Header />
      <main id="main" tabIndex={-1}>
        <h1 className="page-title">关于我</h1>
        <section className="identity" aria-label="身份与介绍">
          <div className="profile">
            <div className="profile-person"><AvatarImage placement="about" /><div><h2 className="author-name">{identity.name}</h2><p className="signature">{identity.signature}</p></div></div>
            <p className="profile-bio">{identity.bio}</p>
          </div>
          {about.introduction.length ? <div className="introduction"><h2 className="small-heading">写在这里</h2>{about.introduction.map((text, index) => <p key={index}>{text}</p>)}</div> : null}
        </section>
        <WritingCalendar {...activity} categoryNames={categoryNames}>
          <div className="fallback-calendar">
            <p className="fallback-note">按日期阅读公开文章。</p>
            {days.size ? <details open><summary>全部日期与文章</summary>{[...days].map(([date, posts]) => <section className="fallback-day" key={date}>
              <h3>{dateLabel(date)} · 发布 {posts.length} 篇</h3>
              <ul className="entry-list">{posts.map((post) => <li key={post.id}><SiteLink className="entry-link" href={`/article/${post.slug}/`}><span className="entry-title">{post.title}</span><span className="entry-category">{getCategory(post.category)!.name}<span aria-hidden="true">→</span></span></SiteLink></li>)}</ul>
            </section>)}</details> : <p>这里还没有公开文章。</p>}
          </div>
        </WritingCalendar>
        {about.interests.length || about.updates.length ? <section className="life-section" aria-label="生活与近况">
          {about.interests.length ? <section className="life-copy" aria-labelledby="life-title"><h2 className="small-heading" id="life-title">生活里的我</h2>{about.interests.map((text, index) => <p key={index}>{text}</p>)}
            <figure className="life-still-life" aria-hidden="true"><Image className="leaves-pair" src={leavesPair} alt="" /><Image className="tea-books" src={teaBooks} alt="" /></figure>
          </section> : null}
          {about.updates.length ? <section className="updates-section" aria-labelledby="updates-title"><h2 className="small-heading" id="updates-title">最近在做</h2><ul className="updates-list">{about.updates.map((update, index) => <li key={index}><p>{update.text}</p><time dateTime={update.date}>{dateLabel(update.date)}</time></li>)}</ul></section> : null}
        </section> : null}
        {about.links.length ? <section className="public-links" aria-labelledby="public-links-title"><h2 id="public-links-title">公开链接</h2><nav aria-label="公开链接">{about.links.map((link) => <a key={link.url} className="text-link" href={link.url} target="_blank" rel="noopener noreferrer">{link.label} <span aria-hidden="true">↗</span></a>)}</nav></section> : null}
      </main>
      <Footer backToTop />
    </div>
  </div>;
}
