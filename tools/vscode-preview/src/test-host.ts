import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PreviewState } from './extension';

export async function run() {
  const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const file = path.join(workspace, 'content/闲暇娱乐/2026-10-10/index.md');
  const original = await readFile(file, 'utf8');
  const extension = vscode.extensions.getExtension<{ getPreviewState(): PreviewState }>('sachi-local.sachi-blog-preview');
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
  await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  await vscode.commands.executeCommand('sachiPreview.open');
  await waitFor((state) => state.receipt?.title === '插件验收' && !!state.receipt.text.includes('最初正文'), 'real Webview ready and rendered');
  async function replace(text: string) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
    assert.ok(await vscode.workspace.applyEdit(edit));
  }
  await replace(original.replace('插件验收', '未保存预览').replace('最初正文', '尚未保存的完整正文'));
  await waitFor((state) => state.receipt?.title === '未保存预览' && state.receipt.text.includes('尚未保存的完整正文') && state.message?.type === 'update' && state.message.dirty, 'unsaved editor buffer');
  assert.equal(await readFile(file, 'utf8'), original, 'preview never writes the article');
  await replace(original.replace('title: 插件验收', 'title: [未完成'));
  await waitFor((state) => state.message?.type === 'error', 'invalid YAML reports an error');
  await replace(original.replace('---\n\n最初正文', 'flow:\n  image: ./assets/shape.png\n---\n\n最初正文'));
  await waitFor((state) => state.receipt?.title === '插件验收' && state.message?.type === 'update' && state.message.warnings.some((warning) => warning.includes('环绕暂用普通排版')) && state.receipt.text.includes('最初正文'), 'partial flow preserves body');
  const flow = original.replace('---\n\n最初正文', 'flow:\n  image: ./assets/shape.png\n---\n\n环绕第一段。\n\n![测试形状](./assets/shape.png)\n\n## 后续正文\n\n最初正文');
  await replace(flow);
  await waitFor((state) => !!state.receipt?.flow && state.receipt.text.includes('环绕第一段') && state.receipt.text.includes('最初正文'), 'automatic contour and shared flow component');
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
  await vscode.commands.executeCommand('workbench.action.closeEditorsInOtherGroups');
  await waitFor((state) => state.document === undefined, 'closing preview releases state');
  console.log('Sachi preview Extension Host integration passed.');
}
