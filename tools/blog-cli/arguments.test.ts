import { describe, expect, it } from 'vitest';
import { parseCli } from './arguments';

describe('Commander command boundary', () => {
  it('parses manual draft save, comparison and non-overwriting export commands', () => {
    expect(parseCli(['draft', 'save', 'post', '--note', '重写了结尾', '--dry-run'])).toMatchObject({ command: 'draft', draftAction: 'save', selectors: ['post'], options: { note: '重写了结尾', 'dry-run': true } });
    expect(parseCli(['draft', 'diff', 'old-id', 'new-id', '--json'])).toMatchObject({ command: 'draft', draftAction: 'diff', selectors: ['old-id', 'new-id'], options: { json: true } });
    expect(parseCli(['draft', 'export', 'id', '--destination', './old-draft'])).toMatchObject({ command: 'draft', draftAction: 'export', options: { destination: './old-draft' } });
    expect(parseCli(['draft', 'restore', 'id', '--dry-run'])).toMatchObject({ command: 'draft', draftAction: 'restore', selectors: ['id'], options: { 'dry-run': true } });
    expect(parseCli(['draft', 'undo', 'transaction', '--yes'])).toMatchObject({ command: 'draft', draftAction: 'undo', selectors: ['transaction'], options: { yes: true } });
    expect(parseCli(['draft', 'migrate', 'post', '--json'])).toMatchObject({ command: 'draft', draftAction: 'migrate', selectors: ['post'], options: { json: true } });
    expect(parseCli(['draft', '--dry-run'])).toMatchObject({ command: 'draft', options: { 'dry-run': true } });
    expect(() => parseCli(['draft', 'save', 'a', 'b'])).toThrow();
  });
  it('parses explicit format selections and repeated spacing exceptions', () => {
    expect(parseCli(['format', 'one', 'two', '--ignore', '维生素B12', '--ignore', 'OpenAI', '--dry-run', '--json'])).toMatchObject({ command: 'format', selectors: ['one', 'two'], options: { ignore: ['维生素B12', 'OpenAI'], 'dry-run': true, json: true } });
    expect(parseCli(['format', '--help']).help).toContain('--ignore');
  });
  it('parses name queries and ID-only series insertion with explicit order', () => {
    expect(parseCli(['search', '博客 玩具', '--json'])).toMatchObject({ command: 'search', selectors: ['博客 玩具'], options: { json: true } });
    expect(parseCli(['series', 'search', '我学会了'])).toMatchObject({ command: 'series', seriesAction: 'search', selectors: ['我学会了'] });
    expect(parseCli(['series', 'add', 'article-id', '--series', 'series-id', '--order', '2', '--dry-run'])).toMatchObject({ command: 'series', seriesAction: 'add', selectors: ['article-id'], options: { series: ['series-id'], order: 2, 'dry-run': true } });
  });
  it('keeps global options before or after the command and normalizes keys', () => {
    expect(parseCli(['--json', '--root', '/tmp/project', 'build', 'a', 'b', '--yes', '--dry-run', '--accept-baseline', '--export'])).toMatchObject({
      command: 'build', selectors: ['a', 'b'], options: { json: true, root: '/tmp/project', yes: true, 'dry-run': true, 'accept-baseline': true, export: true },
    });
  });
  it('collects repeated YAML metadata assignments without mangling values', () => {
    expect(parseCli(['meta', 'my-post', '--set', 'tags=[日常,记录]', '--set', 'summary=正文: 两个冒号', '--yes']).options.set).toEqual(['tags=[日常,记录]', 'summary=正文: 两个冒号']);
  });
  it('generates root and command help without terminating the test process', () => {
    expect(parseCli(['--help']).help).toContain('wizard');
    const help = parseCli(['publish', '--help', '--json']);
    expect(help.help).toContain('--resume'); expect(help.options.json).toBe(true);
  });
  it('allows no command for the terminal menu', () => {
    expect(parseCli([])).toEqual({ selectors: [], options: {} });
  });
  it.each([
    ['unknown'], ['new', '--totle', 'test'], ['build', '--destination', 'elsewhere'],
    ['init', '--visibility', 'maybe'], ['new', '--title'], ['meta', 'a', 'b'],
    ['publish', 'a', '--resume', 'r-example'],
  ])('rejects unknown, misplaced or conflicting arguments: %j', (...args) => {
    expect(() => parseCli(args)).toThrow();
  });
});
