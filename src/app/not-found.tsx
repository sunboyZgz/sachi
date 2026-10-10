import { SiteLink as Link } from '@/components/SiteLink';

export default function NotFound() {
  return (
    <main id="main" className="not-found">
      <h1>这一页还没有写好。</h1>
      <Link className="text-link" href="/contents/">返回目录 →</Link>
    </main>
  );
}
