import { AvatarImage } from '@/components/AvatarImage';
import { identity } from '@/config/site';
import { AuthorSignatureView } from './AuthorSignatureView';
import { SiteLink } from './SiteLink';

export function AuthorSignature() {
  return <AuthorSignatureView avatar={<AvatarImage placement="signature" />} name={identity.name} bio={identity.bio}
    aboutLink={<SiteLink className="author-about-link" href="/about/">关于我 <span aria-hidden="true">→</span></SiteLink>} />;
}
