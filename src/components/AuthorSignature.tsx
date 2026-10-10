import { AvatarImage } from '@/components/AvatarImage';
import { identity } from '@/config/site';
import { AuthorSignatureView } from './AuthorSignatureView';

export function AuthorSignature() {
  return <AuthorSignatureView avatar={<AvatarImage placement="signature" />} name={identity.name} bio={identity.bio} />;
}
