import { AvatarImage } from '@/components/AvatarImage';
import { identity } from '@/config/site';

export function AuthorSignature() {
  return (
    <section className="author-signature" aria-label="作者介绍">
      <AvatarImage placement="signature" />
      <div className="author-signature-copy">
        <p className="author-signature-name">{identity.name}</p>
        <p className="author-signature-bio">{identity.bio}</p>
      </div>
    </section>
  );
}
