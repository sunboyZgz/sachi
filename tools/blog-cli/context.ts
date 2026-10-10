import { BlogError } from '../../src/lib/blog/files';
import type { BlogConfig } from '../../src/lib/blog/schema';
import type { Invocation } from './arguments';
import type { PromptDriver } from './prompts';

export type CommandContext = {
  root: string; config: BlogConfig; invocation: Invocation; prompts: PromptDriver;
  print: (status: string, data: unknown) => void;
  confirm: (description: string) => Promise<void>;
};
export function confirmation(invocation: Invocation, prompts: PromptDriver, show: (text: string) => void) {
  return async (description: string) => {
    show(description);
    if (invocation.options.yes) return;
    if (!prompts.enabled) throw new BlogError('需要明确确认。检查计划后使用 --yes。', 2, 'CONFIRMATION_REQUIRED');
    if (!await prompts.confirm('确认执行以上操作？（默认取消）')) throw new BlogError('已取消当前操作。', 130, 'CANCELLED');
  };
}
