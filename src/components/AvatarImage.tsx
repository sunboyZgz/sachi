import Image from 'next/image';
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
  return (
    <span className={`avatar-slot avatar-slot--${placement}`} aria-hidden="true">
      <Image
        className="avatar-image"
        src={avatarByPlacement[placement]}
        alt=""
        sizes={sizesByPlacement[placement]}
      />
    </span>
  );
}
