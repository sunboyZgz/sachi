import Image from 'next/image';
import { profile } from '@/config/profile';
import { withBasePath } from '@/lib/site-path';
import { resourceUrl } from '@/lib/blog/yandu';
import avatarHalf from '@/assets/avatar/avatar-half.png';
import avatarHead from '@/assets/avatar/avatar-head.png';

type AvatarPlacement = 'home' | 'directory' | 'signature' | 'about';

const avatarByPlacement = {
  home: avatarHead,
  directory: avatarHead,
  signature: avatarHalf,
  about: avatarHead,
} as const;

const sizesByPlacement = {
  home: '(max-width: 600px) 48px, 56px',
  directory: '(max-width: 600px) 28px, 32px',
  signature: '(max-width: 600px) 88px, 120px',
  about: '(max-width: 600px) 73px, 84px',
} as const;

export function AvatarImage({ placement }: { placement: AvatarPlacement }) {
  const ref = placement === 'signature' ? profile.avatars?.half : profile.avatars?.head;
  const fallback = avatarByPlacement[placement];
  const src = ref ? process.env.NODE_ENV === 'development' ? `/media/profile/${ref.sha256}.png` : withBasePath(resourceUrl(ref), process.env.NEXT_PUBLIC_BLOG_BASE_PATH ?? '') : fallback;
  return (
    <span className={`avatar-slot avatar-slot--${placement}`} aria-hidden="true">
      <Image
        className="avatar-image"
        src={src}
        width={ref?.width ?? fallback.width}
        height={ref?.height ?? fallback.height}
        unoptimized={!!ref}
        alt=""
        sizes={sizesByPlacement[placement]}
      />
    </span>
  );
}
