import { afterEach, describe, expect, it } from 'vitest';
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants';
import config from '../../next.config';

const original = process.env.INCLUDE_FIXTURES;
afterEach(() => {
  if (original === undefined) delete process.env.INCLUDE_FIXTURES;
  else process.env.INCLUDE_FIXTURES = original;
});

describe('fixture cache and static export isolation', () => {
  it('keeps the fixture development cache outside the directory production cleans', () => {
    process.env.INCLUDE_FIXTURES = 'true';
    const development = config(PHASE_DEVELOPMENT_SERVER);
    const build = config(PHASE_PRODUCTION_BUILD);
    expect(development.distDir).toBe('.next-fixtures-dev');
    expect(development.distDir?.startsWith(`${build.distDir}/`)).toBe(false);
    expect(development.output).toBeUndefined();
  });
  it('uses the default build directory so export stays in out for both build modes', () => {
    for (const fixtures of ['true', 'false']) {
      process.env.INCLUDE_FIXTURES = fixtures;
      expect(config(PHASE_PRODUCTION_BUILD)).toMatchObject({ distDir: '.next', output: 'export' });
    }
  });
  it('keeps daily writing in its existing development directory', () => {
    process.env.INCLUDE_FIXTURES = 'false';
    expect(config(PHASE_DEVELOPMENT_SERVER)).toMatchObject({ distDir: '.next' });
  });
});
