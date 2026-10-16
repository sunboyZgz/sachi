import { profile } from '@/config/site';

export function Footer({ note, backToTop = false }: { note?: string; backToTop?: boolean }) {
  const fixtureMode = process.env.INCLUDE_FIXTURES === 'true';
  const caption = note ?? (fixtureMode ? '示例内容 · 用于排版预览' : undefined);
  const year = Math.max(profile.copyrightStartYear, new Date().getUTCFullYear());
  const copyrightYears = year === profile.copyrightStartYear ? String(year) : `${profile.copyrightStartYear}–${year}`;
  return (
    <footer className="page-footer">
      <span>© {copyrightYears} {profile.name}</span>
      {backToTop ? <a href="#about-top">回到顶部 <span aria-hidden="true">↑</span></a> : caption ? <span>{caption}</span> : null}
    </footer>
  );
}
