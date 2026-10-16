import type { ReactNode } from 'react';

export function AuthorSignatureView({ avatar, name, bio, aboutLink }: { avatar: ReactNode; name: string; bio: string; aboutLink?: ReactNode }) {
  return <section className="author-signature" aria-label="作者介绍">
    {avatar}
    <div className="author-signature-copy">
      <p className="author-signature-name">{name}</p>
      <p className="author-signature-bio">{bio}</p>
      {aboutLink}
    </div>
  </section>;
}
