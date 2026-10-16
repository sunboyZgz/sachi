import Image from 'next/image';
import { SiteLink as Link } from '@/components/SiteLink';
import { Arrow } from '@/components/Arrow';
import { AvatarImage } from '@/components/AvatarImage';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { brandArtwork, identity, siteAsset } from '@/config/site';
import { pageMetadata, websiteJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';

export async function generateMetadata() {
  return pageMetadata({ path: '/', title: identity.name, description: identity.seo.description ?? identity.bio, home: true });
}

export default async function HomePage() {
  const fixtureMode = process.env.INCLUDE_FIXTURES === 'true';
  return (
    <div className="home frame">
      <JsonLd data={await websiteJsonLd()} />
      <Header cover />
      <main id="main" className="cover" tabIndex={-1}>
        <section className="cover-copy" aria-label="个人介绍">
          <h1 className="cover-title">
            {identity.name === brandArtwork.title.text ? <>
              <span className="sr-only">{identity.name}</span>
              <Image src={siteAsset(brandArtwork.title.src)} alt="" width={590} height={153} priority />
            </> : <span className="cover-title-text">{identity.name}</span>}
          </h1>
          <p className="cover-signature">
            {identity.signature === brandArtwork.signature.text ? <>
              <span className="sr-only">{identity.signature}</span>
              <Image src={siteAsset(brandArtwork.signature.src)} alt="" width={441} height={61} priority />
            </> : <span className="cover-signature-text">{identity.signature}</span>}
          </p>
          <div className="cover-rule" aria-hidden="true" />
          <div className="home-profile">
            <Link className="home-avatar-link" href="/about/" aria-label="关于我">
              <AvatarImage placement="home" />
              <span className="home-avatar-tip" aria-hidden="true">关于我</span>
            </Link>
            <p className="cover-bio">{identity.bio}</p>
          </div>
          <Link className="text-link cover-entry" href="/contents/">
            浏览目录 <Arrow />
          </Link>
          {fixtureMode ? <div><Link className="quiet-link" href="/article/special-blocks/">查看特殊块排版样例 <Arrow /></Link></div> : null}
        </section>
        <picture className="cover-art">
          <source media="(max-width:600px)" srcSet={siteAsset('/assets/desk-scene-mobile.webp')} />
          {/* The picture element provides the confirmed mobile crop. */}
          <img
            src={siteAsset('/assets/desk-scene.webp')}
            alt="由手稿、书本、一杯茶和笔记本电脑组成的创作桌面插画"
            width="985"
            height="763"
            fetchPriority="high"
          />
        </picture>
      </main>
      <Footer note={fixtureMode ? '封面 · 第一版视觉样板' : '封面'} />
    </div>
  );
}
