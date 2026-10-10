import { describe, expect, it } from 'vitest';
import source from './profile.json';
import { profileSchema } from './profile';

describe('public personal configuration', () => {
  it('keeps current defaults and supports changing the public identity', () => {
    expect(profileSchema.parse(source).name).toBe('请叫我木头人');
    expect(profileSchema.parse({ ...source, name: '新的名字', bio: '新的简介', signature: '新的签名' })).toMatchObject({ name: '新的名字', bio: '新的简介' });
  });
  it('rejects typos, invalid copyright dates and private or executable profile links', () => {
    for (const changed of [{ secret: 'private' }, { name: '' }, { copyrightStartYear: 0 }, { authorUrl: 'javascript:alert(1)' }, { sameAs: ['https://user:secret@example.org/'] }]) expect(profileSchema.safeParse({ ...source, ...changed }).success).toBe(false);
  });
});
