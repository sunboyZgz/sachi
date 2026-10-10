import { stdin, stderr } from 'node:process';
import { BlogError } from '../../src/lib/blog/files';
import { categoryNames, postSchema } from '../../src/lib/blog/schema';

export type Choice = { name: string; value: string; description?: string };
export type Validator = (value: string) => true | string | Promise<true | string>;
export type PromptDriver = {
  enabled: boolean;
  select: (message: string, choices: Choice[]) => Promise<string>;
  input: (message: string, validate: Validator, settings?: { default?: string }) => Promise<string>;
  checkbox: (message: string, choices: Choice[]) => Promise<string[]>;
  confirm: (message: string) => Promise<boolean>;
};
export type NewPostOptions = { category?: string; title?: string; slug?: string };

async function promptResult<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof Error && ['ExitPromptError', 'AbortPromptError', 'CancelPromptError'].includes(error.name)) {
      throw new BlogError('已取消当前操作。', 130, 'CANCELLED');
    }
    throw error;
  }
}

export function createTerminalPrompts(enabled: boolean, streams: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream } = { input: stdin, output: stderr }): PromptDriver {
  return {
    enabled,
    select: async (message, choices) => promptResult(async () => {
      const { default: select } = await import('@inquirer/select');
      return await select({
        message, choices, loop: false, pageSize: Math.min(8, choices.length),
        theme: { style: { keysHelpTip: () => '↑/↓ 选择，Enter 确认，Ctrl+C 取消' } },
      }, streams);
    }),
    input: async (message, validate, settings) => promptResult(async () => {
      const { default: input } = await import('@inquirer/input');
      return await input({ message, validate, ...settings }, streams);
    }),
    checkbox: async (message, choices) => promptResult(async () => {
      const { default: checkbox } = await import('@inquirer/checkbox');
      return await checkbox({ message, choices: choices.map((choice) => ({ ...choice, checked: false })), loop: false, pageSize: Math.min(8, choices.length),
        shortcuts: { all: null, invert: null },
        validate: (selected) => selected.length ? true : '请至少明确选择一项；Ctrl+C 可取消。',
        theme: { style: { keysHelpTip: () => '↑/↓ 移动，空格勾选，Enter 确认，Ctrl+C 取消' } },
      }, streams);
    }),
    confirm: async (message) => promptResult(async () => {
      const { default: confirm } = await import('@inquirer/confirm');
      return await confirm({ message, default: false, transformer: (value) => value ? '继续' : '取消' }, streams);
    }),
  };
}

export function validateTitle(value: string): true | string {
  return value.trim() ? true : '标题不能为空，请输入文章标题。';
}

export async function collectNewPostOptions(options: NewPostOptions, prompts: PromptDriver) {
  const choices = Object.entries(categoryNames).map(([value, name]) => ({ name, value }));
  const findCategory = (value: string) => choices.find((choice) => choice.value === value || choice.name === value);
  if (options.category !== undefined && !findCategory(options.category)) throw new BlogError('栏目只能是闲暇娱乐、生活旁白或蘸豆！！（也支持 play/life/learn）。', 2);
  const titleValidation = options.title === undefined ? true : validateTitle(options.title);
  if (titleValidation !== true) throw new BlogError(titleValidation, 2);
  if (options.slug !== undefined && !postSchema.shape.slug.safeParse(options.slug).success) throw new BlogError('slug 只能包含字母、数字、下划线或短横线，且必须以字母或数字开头。', 2);
  const missing = [options.category === undefined ? '--category' : null, options.title === undefined ? '--title' : null].filter(Boolean);
  if (missing.length && !prompts.enabled) throw new BlogError(`非交互或 --json 模式需要提供 ${missing.join(' 和 ')}；在终端运行 npm run blog -- new 可选择栏目并输入标题。`, 2, 'INPUT_REQUIRED');

  const category = findCategory(options.category ?? await prompts.select('选择文章栏目', choices));
  if (!category) throw new BlogError('请选择有效栏目。', 2);
  const title = options.title ?? await prompts.input('文章标题', validateTitle);
  const finalTitleValidation = validateTitle(title);
  if (finalTitleValidation !== true) throw new BlogError(finalTitleValidation, 2);
  return { category: category.name, title: title.trim(), slug: options.slug };
}
