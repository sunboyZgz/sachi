import { SiteLink as Link } from '@/components/SiteLink';
import { AvatarImage } from '@/components/AvatarImage';
import { identity } from '@/config/site';

type HeaderProps =
  | { cover: true; backHref?: never; backLabel?: never; showAvatar?: never }
  | { cover?: false; backHref?: string; backLabel?: string; showAvatar?: boolean };

export function Header(props: HeaderProps) {
  if (props.cover) {
    return (
      <header className="page-top">
        <span className="home-label">
          <i className="home-topmark" aria-hidden="true" />{identity.homeLabel}
        </span>
        <span className="micro">封面</span>
      </header>
    );
  }

  return (
    <header className="page-top">
      <Link className="backlink" href={props.backHref ?? '/'}>
        <span aria-hidden="true">←</span>{props.backLabel ?? '返回首页'}
      </Link>
      <Link className={`small-brand${props.showAvatar ? ' small-brand--with-avatar' : ''}`} href="/">
        {props.showAvatar ? <AvatarImage placement="directory" /> : null}
        <span>{identity.name}</span>
      </Link>
    </header>
  );
}
