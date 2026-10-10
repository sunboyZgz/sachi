import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { collectNewPostOptions, createTerminalPrompts, type PromptDriver } from './prompts';

function driver(category = 'life', enabled = true) {
  return {
    enabled,
    select: vi.fn<PromptDriver['select']>(async () => category),
    input: vi.fn<PromptDriver['input']>(async () => '  一篇新文章  '),
    checkbox: vi.fn<PromptDriver['checkbox']>(async () => []),
    confirm: vi.fn<PromptDriver['confirm']>(async () => false),
  };
}
function terminal() {
  const input = new PassThrough(); const output = new PassThrough();
  let text = '';
  output.on('data', (chunk: Buffer) => { text += chunk.toString(); });
  return { input, output, text: () => text, prompts: createTerminalPrompts(true, { input, output }) };
}

describe('new post selection flow', () => {
  it.each([['play', '闲暇娱乐'], ['life', '生活旁白'], ['learn', '蘸豆！！']])('offers the three fixed categories and resolves %s', async (value, name) => {
    const prompts = driver(value);
    expect(await collectNewPostOptions({}, prompts)).toEqual({ category: name, title: '一篇新文章', slug: undefined });
    expect(prompts.select).toHaveBeenCalledWith('选择文章栏目', [
      { name: '闲暇娱乐', value: 'play' }, { name: '生活旁白', value: 'life' }, { name: '蘸豆！！', value: 'learn' },
    ]);
    expect(prompts.input).toHaveBeenCalledOnce();
    expect(prompts.input.mock.calls[0][1]('  ')).toContain('标题不能为空');
  });
  it('only asks for missing values', async () => {
    const titleOnly = driver();
    expect(await collectNewPostOptions({ title: '已有标题' }, titleOnly)).toMatchObject({ category: '生活旁白', title: '已有标题' });
    expect(titleOnly.select).toHaveBeenCalledOnce(); expect(titleOnly.input).not.toHaveBeenCalled();
    const categoryOnly = driver();
    expect(await collectNewPostOptions({ category: '蘸豆！！' }, categoryOnly)).toMatchObject({ category: '蘸豆！！', title: '一篇新文章' });
    expect(categoryOnly.select).not.toHaveBeenCalled(); expect(categoryOnly.input).toHaveBeenCalledOnce();
  });
  it('keeps complete script arguments non-interactive', async () => {
    const prompts = driver('life', false);
    expect(await collectNewPostOptions({ category: 'learn', title: '  参数标题  ', slug: 'from-args' }, prompts)).toEqual({ category: '蘸豆！！', title: '参数标题', slug: 'from-args' });
    expect(prompts.select).not.toHaveBeenCalled(); expect(prompts.input).not.toHaveBeenCalled();
  });
  it.each([{}, { title: '只有标题' }, { category: 'life' }])('fails fast without a TTY when required parameters are missing: %j', async (options) => {
    const prompts = driver('life', false);
    await expect(collectNewPostOptions(options, prompts)).rejects.toMatchObject({ code: 2, status: 'INPUT_REQUIRED' });
    expect(prompts.select).not.toHaveBeenCalled(); expect(prompts.input).not.toHaveBeenCalled();
  });
  it.each([{ category: '随意栏目' }, { title: '   ' }, { slug: '../invalid' }])('rejects explicit invalid values before asking questions: %j', async (options) => {
    const prompts = driver();
    await expect(collectNewPostOptions(options, prompts)).rejects.toMatchObject({ code: 2 });
    expect(prompts.select).not.toHaveBeenCalled(); expect(prompts.input).not.toHaveBeenCalled();
  });
});

describe('real terminal prompt adapter', () => {
  it('requires an explicit checkbox selection instead of silently selecting all', async () => {
    const tty = terminal();
    const answer = tty.prompts.checkbox('选择文章', [{ name: 'A', value: 'a' }, { name: 'B', value: 'b' }]);
    await vi.waitFor(() => expect(tty.text()).toContain('空格勾选'));
    tty.input.write('\r');
    await vi.waitFor(() => expect(tty.text()).toContain('至少明确选择一项'));
    tty.input.write('\u001b[B \r');
    await expect(answer).resolves.toEqual(['b']);
    tty.input.destroy(); tty.output.destroy();
  });
  it('defaults a destructive confirmation to cancel on Enter', async () => {
    const tty = terminal(); const answer = tty.prompts.confirm('确认执行？');
    await vi.waitFor(() => expect(tty.text()).toContain('确认执行'));
    tty.input.write('\r');
    await expect(answer).resolves.toBe(false);
    tty.input.destroy(); tty.output.destroy();
  });
  it('accepts arrow keys and Enter for category selection', async () => {
    const tty = terminal();
    const answer = tty.prompts.select('选择文章栏目', [{ name: '闲暇娱乐', value: 'play' }, { name: '生活旁白', value: 'life' }, { name: '蘸豆！！', value: 'learn' }]);
    await vi.waitFor(() => expect(tty.text()).toContain('Ctrl+C 取消'));
    tty.input.write('\u001b[B\r');
    await expect(answer).resolves.toBe('life');
    tty.input.destroy(); tty.output.destroy();
  });
  it('keeps an empty title in the input step until a valid value is supplied', async () => {
    const tty = terminal();
    const answer = tty.prompts.input('文章标题', (value) => value.trim() ? true : '标题不能为空');
    await vi.waitFor(() => expect(tty.text()).toContain('文章标题'));
    tty.input.write('\r');
    await vi.waitFor(() => expect(tty.text()).toContain('标题不能为空'));
    tty.input.write('秋天的一杯茶\r');
    await expect(answer).resolves.toBe('秋天的一杯茶');
    tty.input.destroy(); tty.output.destroy();
  });
  it('turns Ctrl+C into a clean cancellation with exit code 130', async () => {
    const tty = terminal();
    const answer = tty.prompts.select('选择文章栏目', [{ name: '生活旁白', value: 'life' }]);
    const cancelled = expect(answer).rejects.toMatchObject({ code: 130, status: 'CANCELLED' });
    await vi.waitFor(() => expect(tty.text()).toContain('选择文章栏目'));
    tty.input.write('\u0003');
    await cancelled;
    tty.input.destroy(); tty.output.destroy();
  });
});
