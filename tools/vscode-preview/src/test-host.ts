import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PreviewState } from './extension';
import type { CodeStyleReceipt, PreviewTestClick, RevealSource } from './protocol';

export async function run() {
  const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const file = path.join(workspace, 'content/闲暇娱乐/2026-10-10/index.md');
  const original = await readFile(file, 'utf8');
  const extension = vscode.extensions.getExtension<{ getPreviewState(): PreviewState; inspectCodeStyles(): void; testPreviewClick(action: PreviewTestClick): void; testSourceRequest(request: RevealSource): Promise<void> }>('sachi-local.sachi-blog-preview');
  assert.ok(extension, 'extension discovered');
  const api = await extension.activate();
  async function waitFor(predicate: (state: PreviewState) => boolean, label: string) {
    const timeout = Date.now() + 20_000;
    while (Date.now() < timeout) {
      const state = api.getPreviewState();
      if (predicate(state)) { console.log(`PASS ${label}`); return state; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${label}: ${JSON.stringify(api.getPreviewState())}`);
  }
  const document = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  await vscode.commands.executeCommand('sachiPreview.open');
  await waitFor((state) => state.receipt?.title === '插件验收' && !!state.receipt.text.includes('最初正文'), 'real Webview ready and rendered');
  async function inspectStyles(label: string, predicate: (receipt: CodeStyleReceipt) => boolean = () => true) {
    let previous = api.getPreviewState().codeStyles?.sequence ?? 0;
    api.inspectCodeStyles();
    const state = await waitFor((state) => {
      const receipt = state.codeStyles;
      if (!receipt || receipt.sequence <= previous) return false;
      if (predicate(receipt)) return true;
      previous = receipt.sequence;
      api.inspectCodeStyles();
      return false;
    }, label);
    return state.codeStyles!;
  }
  for (const [theme, kind] of [['Default Light Modern', 'vscode-light'], ['Default Dark Modern', 'vscode-dark']]) {
    await vscode.workspace.getConfiguration('workbench').update('colorTheme', theme, vscode.ConfigurationTarget.Global);
    const styles = await inspectStyles(`${theme}: actual Webview code colors`, (receipt) => receipt.theme === kind);
    assert.equal(styles.blocks.length, 2);
    for (const code of styles.blocks) {
      assert.equal(code.color, 'rgb(63, 70, 63)');
      assert.equal(code.background, 'rgb(238, 238, 229)');
    }
    assert.equal(styles.blocks[0].text, 'const value = "<tag>&";\n\n// 中文注释\nconsole.log(value, 1);\n');
    assert.equal(styles.blocks[0].tokens['hljs-keyword'], 'rgb(67, 83, 61)');
    assert.equal(styles.blocks[0].tokens['hljs-string'], 'rgb(121, 80, 44)');
    assert.equal(styles.blocks[0].tokens['hljs-comment'], 'rgb(98, 107, 96)');
    assert.equal(styles.blocks[0].tokens['hljs-number'], 'rgb(118, 81, 124)');
    assert.deepEqual(styles.blocks[1].tokens, {});
    assert.equal(styles.blocks[1].text, '理解工具解决的问题 -> 理解项目的宏观架构\n');
    assert.equal(styles.inline.length, 2);
    for (const code of styles.inline) assert.equal(code.color, code.parentColor, 'inline code inherits paragraph/link color');
  }
  const highlightFile = path.join(workspace, 'src/styles/code-highlight.css');
  const highlightCss = await readFile(highlightFile, 'utf8');
  const styleBefore = api.getPreviewState().message;
  await writeFile(highlightFile, highlightCss.replace('color: #43533d;', 'color: #203421;'));
  await waitFor((state) => state.message?.type === 'update' && styleBefore?.type === 'update' && state.message.styles[2] !== styleBefore.styles[2] && !!state.receipt, 'shared highlight stylesheet refresh');
  await inspectStyles('new highlight color applied without reinstalling', (receipt) => receipt.blocks[0]?.tokens['hljs-keyword'] === 'rgb(32, 52, 33)');
  await writeFile(highlightFile, highlightCss);
  await inspectStyles('shared highlight color restored', (receipt) => receipt.blocks[0]?.tokens['hljs-keyword'] === 'rgb(67, 83, 61)');
  async function replace(text: string) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
    assert.ok(await vscode.workspace.applyEdit(edit));
  }
  await replace(original.replace('插件验收', '未保存预览').replace('最初正文', '尚未保存的完整正文'));
  await waitFor((state) => state.receipt?.title === '未保存预览' && state.receipt.text.includes('尚未保存的完整正文') && state.message?.type === 'update' && state.message.dirty, 'unsaved editor buffer');
  assert.equal(await readFile(file, 'utf8'), original, 'preview never writes the article');
  await replace(original.replace('最初正文', '::首行缩进正文'));
  await waitFor((state) => !!state.receipt?.text.includes('\u2003\u2003首行缩进正文') && !state.receipt.text.includes('::首行缩进正文'), 'paragraph marker in unsaved Webview');
  await replace(original.replace('最初正文', '第一行正文。\\\n::紧凑换行缩进正文'));
  await waitFor((state) => !!state.receipt?.text.includes('第一行正文。') && state.receipt.text.includes('\u2003\u2003紧凑换行缩进正文') && !state.receipt.text.includes('::紧凑'), 'hard break and indentation in unsaved Webview');
  await replace(original.replace('title: 插件验收', 'title: [未完成'));
  await waitFor((state) => state.message?.type === 'error', 'invalid YAML reports an error');
  await replace(original.replace('---\n\n最初正文', 'flow:\n  image: ./assets/shape.png\n---\n\n最初正文'));
  await waitFor((state) => state.receipt?.title === '插件验收' && state.message?.type === 'update' && state.message.warnings.some((warning) => warning.includes('环绕暂用普通排版')) && state.receipt.text.includes('最初正文'), 'partial flow preserves body');
  const flow = original.replace('---\n\n最初正文', 'flow:\n  image: ./assets/shape.png\n---\n\n::环绕第一段。\\\n::环绕紧凑换行。\n\n![测试形状](./assets/shape.png)\n\n## 后续正文\n\n最初正文');
  await replace(flow);
  await waitFor((state) => !!state.receipt?.flow && state.receipt.text.includes('\u2003\u2003环绕第一段') && state.receipt.text.includes('\u2003\u2003环绕紧凑换行') && state.receipt.text.includes('最初正文'), 'automatic contour and compact indented flow lines');
  async function locate(text: string, reason = 'cursor') {
    const point = document.positionAt(document.getText().indexOf(text));
    const before = api.getPreviewState().navigation?.sequence ?? -1;
    editor.selection = new vscode.Selection(point, point);
    if (reason === 'manual') await vscode.commands.executeCommand('sachiPreview.revealLine');
    const state = await waitFor((state) => !!state.navigation && state.navigation.sequence > before && state.navigation.version === document.version && state.navigation.requestedLine === point.line + 1 && state.navigation.matchedLine === point.line + 1 && state.navigation.visible, `source ${reason}: ${text}`);
    assert.equal(vscode.window.activeTextEditor, editor, 'navigation preserves editor focus');
    return state.navigation!;
  }
  await locate('::环绕紧凑换行');
  const longBody = Array.from({ length: 55 }, (_, index) => `第 ${index} 段内容。`).join('\n\n');
  await replace(original.replace('最初正文。', `${longBody}\n\n## 远处的标题\n\n第一行定位。\\\n::紧凑定位。\n\n| 表头 |\n| --- |\n| 精确单元格 |\n\n\`\`\`ts\nconst first = 1;\nconst target = 2;\n\`\`\`\n\n末尾内容。`));
  await waitFor((state) => !!state.receipt?.text.includes('末尾内容'), 'long article source markers rendered');
  assert.ok((await locate('远处的标题')).scrollTop > 0, 'far heading scrolls into view');
  await locate('::紧凑定位');
  await locate('精确单元格');
  assert.equal((await locate('const target')).kind, 'code');
  assert.equal((await locate('target = 2')).kind, 'code');
  assert.equal((await locate('2;')).kind, 'code');
  const savedLong = document.getText();
  const clickBody = '## 点击标题\n\n::   重复 &#x1f600; &amp; \\*文字。\n\n第二段重复。\n\n**强调重复** 与 `行内代码`。\n\n- 列表正文\n\n> 引用正文\n\n| 列 |\n| --- |\n| 表格正文 |\n\n> ```ts\n> const nestedToken = 2;\n> ```\n\n';
  await replace(original.replace('最初正文。', clickBody));
  await waitFor((state) => !!state.receipt?.text.includes('nestedToken'), 'click-to-source article rendered');
  async function clickSource(action: PreviewTestClick, needle: string, sourceDocument = document) {
    const before = api.getPreviewState().sourceNavigation;
    const text = sourceDocument.getText(), dirty = sourceDocument.isDirty;
    api.testPreviewClick(action);
    const state = await waitFor((state) => !!state.sourceNavigation?.accepted && state.sourceNavigation !== before && !!state.testClick?.found, `preview click: ${action.text}`);
    const point = sourceDocument.positionAt(text.indexOf(needle));
    const active = vscode.window.activeTextEditor;
    assert.ok(active, 'an editor is focused');
    assert.equal(active?.document.uri.fsPath, sourceDocument.uri.fsPath, 'source editor takes focus');
    assert.ok(active.selection.isEmpty && active.selection.active.isEqual(point), `exact source caret for ${needle}: ${JSON.stringify(active.selection.active)} versus ${JSON.stringify(point)}`);
    assert.equal(sourceDocument.getText(), text, 'click never edits the buffer');
    assert.equal(sourceDocument.isDirty, dirty, 'click preserves dirty state');
    const scroll = state.testClick!.scrollTop;
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await inspectStyles('preview retains click scroll position')).scrollTop, scroll);
    return state.sourceNavigation!;
  }
  await clickSource({ text: '点击标题', selector: '.article-heading' }, '点击标题');
  await clickSource({ text: '😀' }, '&#x1f600;');
  await clickSource({ text: '&' }, '&amp;');
  await clickSource({ text: '*文字' }, '\\*文字');
  await clickSource({ text: '第二段重复' }, '第二段重复');
  await clickSource({ text: '强调重复' }, '强调重复');
  await clickSource({ text: '行内代码', selector: 'code' }, '行内代码');
  await clickSource({ text: '列表正文' }, '列表正文');
  await clickSource({ text: '引用正文' }, '引用正文');
  await clickSource({ text: '表格正文' }, '表格正文');
  await clickSource({ text: 'nestedToken', selector: 'pre code' }, 'nestedToken');
  await clickSource({ text: '插件验收', selector: '.article-title' }, 'title:');
  for (const gesture of ['drag', 'right'] as const) {
    const before = api.getPreviewState().sourceNavigation;
    const testBefore = api.getPreviewState().testClick?.sequence ?? 0;
    api.testPreviewClick({ text: '第二段重复', gesture });
    const state = await waitFor((state) => (state.testClick?.sequence ?? 0) > testBefore, `preview ${gesture} remains independent`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(api.getPreviewState().sourceNavigation, before);
    if (gesture === 'drag') assert.equal(state.testClick?.selectionCollapsed, false);
  }
  await vscode.workspace.getConfiguration('sachiPreview').update('syncScroll', false, vscode.ConfigurationTarget.Workspace);
  await waitFor((state) => state.message?.type === 'update' && !state.message.source.syncEnabled && !!state.receipt, 'click independent of scroll synchronization');
  await clickSource({ text: '第二段重复' }, '第二段重复');
  await vscode.workspace.getConfiguration('sachiPreview').update('clickToSource', false, vscode.ConfigurationTarget.Workspace);
  await waitFor((state) => state.message?.type === 'update' && !state.message.source.clickEnabled && !!state.receipt, 'click-to-source disabled');
  const beforeDisabled = api.getPreviewState().sourceNavigation;
  const testBeforeDisabled = api.getPreviewState().testClick?.sequence ?? 0;
  api.testPreviewClick({ text: '点击标题' });
  await waitFor((state) => (state.testClick?.sequence ?? 0) > testBeforeDisabled, 'disabled click leaves source caret alone');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(api.getPreviewState().sourceNavigation, beforeDisabled);
  await vscode.workspace.getConfiguration('sachiPreview').update('clickToSource', true, vscode.ConfigurationTarget.Workspace);
  await waitFor((state) => state.message?.type === 'update' && state.message.source.clickEnabled && !!state.receipt, 'click-to-source enabled');
  const displayed = api.getPreviewState().message;
  assert.equal(displayed?.type, 'update');
  if (displayed?.type === 'update') {
    await api.testSourceRequest({ type: 'revealSource', document: file, revision: displayed.revision - 1, version: document.version, sequence: (api.getPreviewState().sourceNavigation?.sequence ?? 0) + 1, line: 1, column: 1 });
    assert.equal(api.getPreviewState().sourceNavigation?.accepted, false, 'stale render never changes the caret');
    await waitFor((state) => state.message?.type === 'update' && state.message.revision > displayed.revision && !!state.receipt, 'stale click triggers a refresh');
  }
  const beforeAuthorEdit = document.getText();
  await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  const authorPoint = document.positionAt(beforeAuthorEdit.indexOf('第二段重复') + 3);
  await editor.edit((edit) => edit.replace(new vscode.Range(authorPoint, authorPoint.translate(0, 2)), '改动'), { undoStopBefore: true, undoStopAfter: true });
  await waitFor((state) => !!state.receipt?.text.includes('第二段改动'), 'unsaved edit ready for undo check');
  await clickSource({ text: '第二段改动' }, '第二段改动');
  await vscode.commands.executeCommand('undo');
  await waitFor((state) => document.getText() === beforeAuthorEdit && !!state.receipt?.text.includes('第二段重复'), 'click preserves author undo history');
  await replace(flow);
  await waitFor((state) => !!state.receipt?.flow && !!state.receipt.text.includes('环绕紧凑换行'), 'flow click mapping rendered');
  await clickSource({ text: '环绕紧凑换行', selector: '.flow-block' }, '环绕紧凑换行');
  await replace(savedLong);
  await waitFor((state) => !!state.receipt?.text.includes('末尾内容'), 'original long article restored');
  await vscode.workspace.getConfiguration('sachiPreview').update('syncScroll', false, vscode.ConfigurationTarget.Workspace);
  await waitFor((state) => state.message?.type === 'update' && !state.message.source.syncEnabled && !!state.receipt, 'automatic source following disabled');
  const firstPoint = document.positionAt(document.getText().indexOf('第 0 段'));
  editor.selection = new vscode.Selection(firstPoint, firstPoint);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(api.getPreviewState().navigation, undefined, 'disabled follow ignores cursor movement');
  await locate('第 0 段', 'manual');
  await vscode.workspace.getConfiguration('sachiPreview').update('syncScroll', true, vscode.ConfigurationTarget.Workspace);
  await locate('末尾内容');
  await new Promise((resolve) => setTimeout(resolve, 200));
  const scrollPoint = document.positionAt(document.getText().indexOf('第 10 段'));
  editor.revealRange(new vscode.Range(scrollPoint, scrollPoint), vscode.TextEditorRevealType.AtTop);
  await waitFor((state) => state.navigation?.reason === 'scroll' && state.navigation.requestedLine === editor.visibleRanges[0].start.line + 1 && state.navigation.visible, 'editor scrolling follows source viewport');
  const media = path.join(workspace, 'content/闲暇娱乐/2026-10-10/media.yaml');
  const mediaDocument = await vscode.workspace.openTextDocument(media);
  const mediaEdit = new vscode.WorkspaceEdit();
  mediaEdit.replace(mediaDocument.uri, new vscode.Range(mediaDocument.positionAt(0), mediaDocument.positionAt(mediaDocument.getText().length)), 'assets:\n  ./assets/demo.mp4:\n    poster: ./assets/shape.png\n');
  await vscode.workspace.applyEdit(mediaEdit);
  await waitFor((state) => state.message?.type === 'update' && !!state.message.post.assets['./assets/demo.mp4']?.poster, 'unsaved media poster');
  const assetBefore = api.getPreviewState().message;
  const asset = path.join(workspace, 'content/闲暇娱乐/2026-10-10/assets/shape.png');
  await writeFile(asset, await readFile(asset));
  await waitFor((state) => state.message?.type === 'update' && assetBefore?.type === 'update' && state.message.post.assets['./assets/shape.png']?.url !== assetBefore.post.assets['./assets/shape.png']?.url, 'asset watcher invalidates cache');
  for (let index = 0; index < 8; index += 1) await replace(original.replace('插件验收', `连续输入 ${index}`));
  await waitFor((state) => state.receipt?.title === '连续输入 7', 'latest edit wins');
  const second = await vscode.workspace.openTextDocument(path.join(workspace, 'content/生活旁白/2026-10-10/index.md'));
  await vscode.window.showTextDocument(second, vscode.ViewColumn.One);
  await waitFor((state) => state.receipt?.title === '另一篇文章', 'follows active article');
  await vscode.workspace.getConfiguration('sachiPreview').update('followActiveEditor', false, vscode.ConfigurationTarget.Workspace);
  await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(api.getPreviewState().document, second.uri.fsPath, 'pinning keeps current article');
  await clickSource({ text: '另一篇的完整正文' }, '另一篇的完整正文', second);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  api.testPreviewClick({ text: '另一篇的完整正文' });
  await waitFor((state) => !!state.sourceNavigation?.accepted && vscode.window.activeTextEditor?.document.uri.fsPath === second.uri.fsPath, 'pinned preview reopens source in original editor group');
  await vscode.commands.executeCommand('workbench.action.closeEditorsInOtherGroups');
  await waitFor((state) => state.document === undefined, 'closing preview releases state');
  console.log('Sachi preview Extension Host integration passed.');
}
