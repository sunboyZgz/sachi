import * as vscode from 'vscode';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { articleLocation, buildPreview, findInternalTarget, internalOrigin, type ArticleLocation } from './preview';
import type { HostMessage, RenderReceipt, ViewMessage } from './protocol';

export type PreviewState = { message?: HostMessage; receipt?: RenderReceipt; document?: string };

async function readText(file: string) {
  const buffer = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === file);
  return buffer ? buffer.getText() : readFile(file, 'utf8');
}

async function locate(document: vscode.TextDocument) {
  if (document.languageId !== 'markdown' || !['file', 'vscode-remote'].includes(document.uri.scheme)) return null;
  const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspace) return null;
  let root = path.dirname(document.uri.fsPath);
  for (;;) {
    try {
      const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
      if (packageJson.name === 'sachi-blog') return articleLocation(root, document.uri.fsPath);
    } catch { /* Walk up through article directories to the project. */ }
    if (root === workspace.uri.fsPath || path.dirname(root) === root) return null;
    root = path.dirname(root);
  }
}

class Preview implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private location?: ArticleLocation;
  private document?: vscode.TextDocument;
  private revision = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private ready = false;
  private follows = 0;
  private watchers: vscode.Disposable[] = [];
  private links = new Map<string, string>();
  private external = new Set<string>();
  readonly state: PreviewState = {};

  constructor(private readonly context: vscode.ExtensionContext) {}

  async open(document = vscode.window.activeTextEditor?.document) {
    const generation = ++this.follows;
    if (!document) { void vscode.window.showInformationMessage('请先打开 content/ 中的博客文章。'); return; }
    const location = await locate(document);
    if (generation !== this.follows) return;
    if (!location) { void vscode.window.showInformationMessage('请打开 Sachi Blog 项目中的 content/<栏目>/<日期>/index.md 或旧 content/*.md。'); return; }
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel('sachiPreview', 'Sachi Blog 文章预览', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
      this.panel.onDidDispose(() => this.close(), undefined, this.context.subscriptions);
      this.panel.webview.onDidReceiveMessage((message: ViewMessage) => {
        if (message?.type === 'ready') { this.ready = true; this.refresh(); }
        if (message?.type === 'openLink' && typeof message.href === 'string') void this.openLink(message.href);
        if (message?.type === 'rendered' && message.receipt?.revision === this.state.message?.revision) this.state.receipt = message.receipt;
      }, undefined, this.context.subscriptions);
      this.setDocument(document, location);
      this.panel.webview.html = this.html(this.panel.webview);
    } else {
      this.setDocument(document, location);
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      this.refresh();
    }
  }

  async follow(editor: vscode.TextEditor | undefined) {
    if (!this.panel || !editor || !vscode.workspace.getConfiguration('sachiPreview').get<boolean>('followActiveEditor', true)) return;
    const generation = ++this.follows;
    const location = await locate(editor.document);
    if (generation !== this.follows || !this.panel || !location || this.document === editor.document) return;
    this.setDocument(editor.document, location);
    this.refresh();
  }

  private setDocument(document: vscode.TextDocument, location: ArticleLocation) {
    this.revision += 1;
    this.document = document;
    this.location = location;
    this.state.document = document.uri.fsPath;
    this.state.receipt = undefined;
    this.panel!.title = `文章预览 · ${path.basename(path.dirname(document.uri.fsPath))}`;
    const roots = [vscode.Uri.joinPath(this.context.extensionUri, 'dist'), vscode.Uri.file(path.join(location.root, 'src/styles')), vscode.Uri.file(path.join(location.root, 'src/assets/avatar')),
      vscode.Uri.file(location.legacy ? path.join(location.root, 'public/assets') : path.join(path.dirname(location.file), 'assets'))];
    this.panel!.webview.options = { enableScripts: true, localResourceRoots: roots };
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers = [];
    const patterns = [
      new vscode.RelativePattern(path.dirname(location.file), '{index.md,media.yaml,assets/**}'),
      new vscode.RelativePattern(location.root, '{blog.config.json,src/config/profile.json,src/styles/*.css,src/assets/avatar/avatar-half.png,public/assets/**,content/series/*.yaml,tests/fixtures/content/series/*.yaml}'),
    ];
    for (const pattern of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      this.watchers.push(watcher, watcher.onDidChange(() => this.refresh()), watcher.onDidCreate(() => this.refresh()), watcher.onDidDelete(() => this.refresh()));
    }
  }

  changed(document: vscode.TextDocument) {
    if (!this.panel || !this.location) return;
    const file = document.uri.fsPath;
    if (document === this.document || file === path.join(path.dirname(this.location.file), 'media.yaml') || file === path.join(this.location.root, 'blog.config.json') || file === path.join(this.location.root, 'src/config/profile.json')) this.refresh();
  }

  refresh() {
    const revision = ++this.revision;
    if (this.timer) clearTimeout(this.timer);
    if (!this.panel || !this.ready || !this.location || !this.document) return;
    const wait = Math.max(0, Math.min(2000, vscode.workspace.getConfiguration('sachiPreview').get<number>('debounceMs', 180)));
    this.timer = setTimeout(() => { this.timer = undefined; void this.render(revision); }, wait);
  }

  private async render(revision: number) {
    const panel = this.panel;
    const location = this.location;
    const document = this.document;
    if (!panel || !location || !document) return;
    let message: HostMessage;
    try {
      const result = await buildPreview({ location, raw: document.getText(), revision, dirty: document.isDirty, resourceUri: (file) => panel.webview.asWebviewUri(vscode.Uri.file(file)).toString(), readText });
      if (revision !== this.revision || this.panel !== panel) return;
      message = result.message;
      this.links = result.links;
      this.external = result.allowedExternal;
    } catch (error) {
      message = { type: 'error', revision, message: error instanceof Error ? error.message : String(error) };
    }
    if (revision !== this.revision || this.panel !== panel) return;
    this.state.message = message;
    this.state.receipt = undefined;
    await panel.webview.postMessage(message);
  }

  private async openLink(href: string) {
    try {
      if (!this.location) return;
      const local = this.links.get(href);
      if (local) { await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(local)); return; }
      const url = new URL(href);
      if (url.origin === internalOrigin) {
        const target = url.searchParams.get('target');
        if (!target || !Object.values(this.state.message?.type === 'update' ? this.state.message.post.assets : {}).some((asset) => asset.url === href)) return;
        const found = await findInternalTarget(this.location, target, readText);
        if (!found) { void vscode.window.showWarningMessage(`当前内容仓库没有找到链接目标：${target}`); return; }
        const editor = await vscode.window.showTextDocument(vscode.Uri.file(found.file), { viewColumn: vscode.ViewColumn.One });
        if (found.fragment) {
          const text = decodeURIComponent(found.fragment).replaceAll('-', ' ');
          const index = editor.document.getText().indexOf(text);
          if (index >= 0) editor.revealRange(new vscode.Range(editor.document.positionAt(index), editor.document.positionAt(index)));
        }
      } else if (this.external.has(href) && ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) await vscode.env.openExternal(vscode.Uri.parse(href));
    } catch (error) { void vscode.window.showWarningMessage(`无法打开链接：${error instanceof Error ? error.message : String(error)}`); }
  }

  private html(webview: vscode.Webview) {
    const nonce = randomBytes(18).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist/webview.js'));
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist/webview.css'));
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; media-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
      <title>Sachi Blog 文章预览</title><link rel="stylesheet" href="${css}"></head>
      <body><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
  }

  private close() {
    this.revision += 1;
    this.follows += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers = [];
    this.panel = undefined;
    this.ready = false;
    this.document = undefined;
    this.location = undefined;
    this.links.clear();
    this.external.clear();
    this.state.document = undefined;
    this.state.message = undefined;
    this.state.receipt = undefined;
  }

  dispose() { this.panel?.dispose(); this.close(); }
}

export function activate(context: vscode.ExtensionContext) {
  const preview = new Preview(context);
  context.subscriptions.push(preview,
    vscode.commands.registerCommand('sachiPreview.open', () => preview.open()),
    vscode.commands.registerCommand('sachiPreview.refresh', () => preview.refresh()),
    vscode.workspace.onDidChangeTextDocument((event) => preview.changed(event.document)),
    vscode.workspace.onDidSaveTextDocument((document) => preview.changed(document)),
    vscode.window.onDidChangeActiveTextEditor((editor) => { void preview.follow(editor); }),
    vscode.workspace.onDidChangeConfiguration((event) => { if (event.affectsConfiguration('sachiPreview')) preview.refresh(); }),
  );
  return { getPreviewState: () => preview.state };
}
