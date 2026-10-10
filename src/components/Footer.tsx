import { profile } from '@/config/site';

export function Footer({ note }: { note?: string }) {
  const fixtureMode = process.env.INCLUDE_FIXTURES === 'true';
  const year = Math.max(profile.copyrightStartYear, new Date().getUTCFullYear());
  const copyrightYears = year === profile.copyrightStartYear ? String(year) : `${profile.copyrightStartYear}–${year}`;
  return (
    <footer className="page-footer">
      <span>© {copyrightYears} {profile.name}</span>
      <span>{note ?? (fixtureMode ? '示例内容 · 用于排版预览' : '内容归档 · 静态发布')}</span>
    </footer>
  );
}
