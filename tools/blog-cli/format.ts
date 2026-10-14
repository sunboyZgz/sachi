import type { Nodes, PhrasingContent, Text } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import { splitDocument } from '../../src/lib/blog/document';
import { createSourceMapper } from '../../src/lib/source-text-map';
import { BlogError } from '../../src/lib/blog/files';
import { articleCatalogue, matchingArticles, type ArticleIdentity } from './catalogue';
import { applyWritingTransaction, type FileChange } from './writing-transactions';

export const defaultSpacingExceptions = ['A股', 'B股', 'H股', 'A站', 'B站'];
type Character = { value: string; before: number; after: number };
export type FormatArticle = { id: string; title: string; file: string; insertedSpaces: number; changes: Array<{ line: number; before: string; after: string }> };
export type FormatResult = { articles: FormatArticle[]; changedArticles: number; insertedSpaces: number; ignoredWords: string[] };
export type FormatPlan = { files: FileChange[]; result: FormatResult };

function spacingExceptions(extra: string[]) {
  if (extra.some((word) => !word.trim() || /[\r\n\0]/u.test(word))) throw new BlogError('--ignore 必须是非空的单行词语。', 2);
  return [...new Set([...defaultSpacingExceptions, ...extra])];
}

/** Insert spaces into original source ranges, never serialize a Markdown tree. */
export function formatMarkdownSpacing(body: string, ignoredWords: string[] = []) {
  const exceptions = spacingExceptions(ignoredWords);
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(body);
  const mapper = createSourceMapper(body, { lineOffset: 0 });
  const starts = [0, ...[...body.matchAll(/\r\n|\n|\r/g)].map((match) => match.index + match[0].length)];
  const offset = (point: { line: number; column: number }) => starts[point.line - 1] + point.column - 1;
  const insertions = new Set<number>();
  const barrier = (): Character[] => [{ value: '\0', before: 0, after: 0 }];
  function characters(node: PhrasingContent): Character[] {
    if (node.type === 'text') {
      const map = mapper.leaf(node as Text);
      // An incomplete construct without an exact source map is left untouched.
      if (map.text !== node.value || map.points.length !== node.value.length + 1) return barrier();
      let index = 0;
      const result = Array.from(node.value, (value) => {
        const result = { value, before: offset(map.points[index]), after: offset(map.points[index + value.length]) };
        index += value.length;
        return result;
      });
      return result.some((char) => char.after <= char.before) ? barrier() : result;
    }
    if (node.type === 'link') {
      const label = node.children.map((child) => child.type === 'text' ? child.value : '').join('');
      if (node.url.startsWith('mailto:') || [label, `http://${label}`, `https://${label}`].includes(node.url)) return barrier();
    }
    if (!['emphasis', 'strong', 'delete', 'link', 'linkReference'].includes(node.type) || !('children' in node)) return barrier();
    const result = node.children.flatMap((child) => characters(child as PhrasingContent));
    if (result.length && node.position) {
      // Outside spaces belong outside **markers** and [labels](destinations).
      result[0].before = node.position.start.offset!;
      result[result.length - 1].after = node.position.end.offset!;
    }
    return result;
  }
  visit(tree, (node: Nodes) => {
    if (!['paragraph', 'heading', 'tableCell'].includes(node.type) || !('children' in node)) return;
    const chars = node.children.flatMap((child) => characters(child as PhrasingContent));
    const text = chars.map((char) => char.value).join('');
    const characterIndexes = new Map<number, number>();
    let length = 0;
    for (const [index, char] of chars.entries()) { characterIndexes.set(length, index); length += char.value.length; }
    characterIndexes.set(length, chars.length);
    const ignored = new Set<number>();
    for (const word of exceptions) {
      for (let from = 0, found = text.indexOf(word, from); found >= 0; found = text.indexOf(word, from)) {
        for (let i = found; i < found + word.length; i++) ignored.add(i);
        from = found + 1;
      }
    }
    const words = /[\p{Script=Latin}\p{Decimal_Number}\p{Mark}]+(?:[._\/-][\p{Script=Latin}\p{Decimal_Number}\p{Mark}]+)*(?:\+\+|#)?/gu;
    for (const word of text.matchAll(words)) {
      if (!/\p{Script=Latin}/u.test(word[0])) continue;
      let skip = false;
      for (let index = word.index; index < word.index + word[0].length; index++) if (ignored.has(index)) { skip = true; break; }
      if (skip) continue;
      const first = characterIndexes.get(word.index)!;
      const end = characterIndexes.get(word.index + word[0].length)!;
      if (first > 0 && /\p{Script=Han}/u.test(chars[first - 1].value)) insertions.add(chars[first].before);
      if (end < chars.length && /\p{Script=Han}/u.test(chars[end].value)) insertions.add(chars[end - 1].after);
    }
  });
  const positions = [...insertions].sort((a, b) => a - b);
  let cursor = 0;
  const pieces: string[] = [];
  for (const position of positions) { pieces.push(body.slice(cursor, position), ' '); cursor = position; }
  pieces.push(body.slice(cursor));
  return { body: pieces.join(''), insertedSpaces: positions.length };
}

function formatArticle(source: ArticleIdentity, ignoredWords: string[]) {
  const { bodyRaw } = splitDocument(source.raw);
  const prefix = source.raw.slice(0, source.raw.length - bodyRaw.length);
  const formatted = formatMarkdownSpacing(bodyRaw, ignoredWords);
  const after = prefix + formatted.body;
  const beforeLines = source.raw.split(/\r\n|\n|\r/);
  const afterLines = after.split(/\r\n|\n|\r/);
  const article: FormatArticle = { id: source.id, title: source.title, file: source.file, insertedSpaces: formatted.insertedSpaces,
    changes: beforeLines.flatMap((before, index) => before === afterLines[index] ? [] : [{ line: index + 1, before, after: afterLines[index] }]) };
  return { article, change: { file: source.file, before: source.raw, after } };
}

/** Uses the writing catalogue so missing media and unfinished flow never block formatting. */
export async function prepareFormat(root: string, selectors: string[], ignoredWords: string[] = []): Promise<FormatPlan> {
  if (!selectors.length) throw new BlogError('format 需要明确选择文章 ID、slug 或路径，不会默认格式化全部文章。', 2, 'INPUT_REQUIRED');
  const exceptions = spacingExceptions(ignoredWords);
  const { articles, issues } = await articleCatalogue(root);
  const selected: ArticleIdentity[] = [];
  for (const selector of selectors) {
    const found = matchingArticles(root, articles, selector);
    if (found.length !== 1) throw new BlogError(`找不到唯一正式文章：${selector}。请使用完整 ID 或具体文件路径。`, 2, 'INPUT_REQUIRED', issues);
    if (!selected.some((source) => source.file === found[0].file)) selected.push(found[0]);
  }
  const plans = selected.map((source) => formatArticle(source, ignoredWords));
  const files = plans.filter((plan) => plan.article.insertedSpaces).map((plan) => plan.change);
  return { files, result: { articles: plans.map((plan) => plan.article), changedArticles: files.length,
    insertedSpaces: plans.reduce((total, plan) => total + plan.article.insertedSpaces, 0), ignoredWords: exceptions } };
}

export function describeFormat(result: FormatResult) {
  return [`选中 ${result.articles.length} 篇，需修改 ${result.changedArticles} 篇，共补 ${result.insertedSpaces} 个空格。`,
    ...result.articles.flatMap((article) => [`${article.title} · ${article.id}\n  ${article.file}${article.insertedSpaces ? '' : '（无需修改）'}`,
      ...article.changes.map((change) => `  第 ${change.line} 行\n- ${change.before}\n+ ${change.after}`)]),
    '仅修改本地正文；元数据、资源及公开快照保持原样。'].join('\n');
}

export async function commitFormat(root: string, plan: FormatPlan, write?: Parameters<typeof applyWritingTransaction>[2]) {
  const transaction = await applyWritingTransaction(root, plan.files, write);
  return { ...plan.result, transaction };
}
