import type { ReactNode } from 'react';

export function AuthorSignatureView({ avatar, name, bio }: { avatar: ReactNode; name: string; bio: string }) {
  return <section className="author-signature" aria-label="作者介绍">
    {avatar}
    <div className="author-signature-copy">
      <p className="author-signature-name">{name}</p>
      <p className="author-signature-bio">{bio}</p>
    </div>
  </section>;
}
