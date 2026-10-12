import * as vscode from 'vscode';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { articleLocation, buildPreview, findInternalTarget, internalOrigin, type ArticleLocation } from './preview';
import { currentSourceRequest } from './source-request';
import type { CodeStyleReceipt, NavigationReceipt, PreviewTestClick, PreviewTestReceipt, RenderMessage, RenderReceipt, RevealLine, RevealSource, SourceNavigationReceipt, ViewMessage } from './protocol';

export type PreviewState = { message?: RenderMessage; receipt?: RenderReceipt; document?: string; navigation?: NavigationReceipt; codeStyles?: CodeStyleReceipt; sourceNavigation?: SourceNavigationReceipt; testClick?: PreviewTestReceipt };
type SourceJump = { document: vscode.TextDocument; version: number; point: vscode.Position; inFlight: boolean; until: number };

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
  private navigationTimer?: ReturnType<typeof setTimeout>;
  private navigationSequence = 0;
  private target?: RevealLine;
  private cursorAt = 0;
  private inspectionSequence = 0;
  private lastSourceSequence = 0;
  private testSequence = 0;
  private editorColumn = vscode.ViewColumn.One;
  private renderedRaw?: string;
  private sourceJump?: SourceJump;
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
        if (message?.type === 'ready') { this.ready = true; this.lastSourceSequence = 0; this.refresh(); }
        if (message?.type === 'openLink' && typeof message.href === 'string') void this.openLink(message.href);
        if (message?.type === 'rendered' && message.receipt?.revision === this.state.message?.revision) this.state.receipt = message.receipt;
        if (message?.type === 'revealed' && message.receipt?.document === this.document?.uri.fsPath && message.receipt.version === this.document.version && message.receipt.sequence === this.target?.sequence) this.state.navigation = message.receipt;
        if (message?.type === 'codeStyles' && message.receipt?.revision === this.state.message?.revision && message.receipt.sequence === this.inspectionSequence) this.state.codeStyles = message.receipt;
        if (message?.type === 'revealSource') void this.revealSource(message);
        if (message?.type === 'previewClickTested' && message.receipt?.sequence === this.testSequence) this.state.testClick = message.receipt;
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
    if (this.sourceJump?.inFlight && editor?.document === this.sourceJump.document) return;
    if (!this.panel || !editor || !vscode.workspace.getConfiguration('sachiPreview').get<boolean>('followActiveEditor', true)) return;
    const generation = ++this.follows;
    const location = await locate(editor.document);
    if (generation !== this.follows || !this.panel || !location) return;
    if (this.document === editor.document && this.location?.file === location.file) { this.navigate(editor, 'cursor'); return; }
    this.setDocument(editor.document, location);
    this.refresh();
  }

  private setDocument(document: vscode.TextDocument, location: ArticleLocation) {
    this.lastSourceSequence = 0;
    this.editorColumn = vscode.window.visibleTextEditors.find((editor) => editor.document === document)?.viewColumn ?? this.editorColumn;
    this.revision += 1;
    this.document = document;
    this.location = location;
    this.state.document = document.uri.fsPath;
    this.state.receipt = undefined;
    this.state.navigation = undefined;
    this.state.sourceNavigation = undefined;
    this.sourceJump = undefined;
    this.renderedRaw = undefined;
    this.target = undefined;
    if (this.navigationTimer) clearTimeout(this.navigationTimer);
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

  private syncEnabled() { return vscode.workspace.getConfiguration('sachiPreview').get<boolean>('syncScroll', true); }
  private clickEnabled() { return vscode.workspace.getConfiguration('sachiPreview').get<boolean>('clickToSource', true); }

  navigate(editor: vscode.TextEditor | undefined, reason: RevealLine['reason'], kind?: vscode.TextEditorSelectionChangeKind) {
    if (!this.panel || !editor || editor.document !== this.document || editor !== vscode.window.activeTextEditor) return;
    const jump = this.sourceJump;
    if (jump && jump.document === editor.document) {
      if (reason === 'manual' || editor.document.version !== jump.version || kind === vscode.TextEditorSelectionChangeKind.Keyboard || kind === vscode.TextEditorSelectionChangeKind.Mouse || !editor.selection.active.isEqual(jump.point) && !jump.inFlight) this.sourceJump = undefined;
      else if (jump.inFlight || Date.now() < jump.until) return;
    }
    if (reason !== 'manual' && !this.syncEnabled()) return;
    if (reason === 'scroll' && Date.now() - this.cursorAt < 160) return;
    if (reason === 'cursor') this.cursorAt = Date.now();
    const point = reason === 'scroll' ? editor.visibleRanges[0]?.start : editor.selection.active;
    if (!point) return;
    this.target = { type: 'revealLine', document: editor.document.uri.fsPath, version: editor.document.version, sequence: ++this.navigationSequence,
      line: point.line + 1, column: point.character + 1, reason };
    if (this.navigationTimer) clearTimeout(this.navigationTimer);
    this.navigationTimer = setTimeout(() => {
      this.navigationTimer = undefined;
      if (this.panel && this.ready && this.target) void this.panel.webview.postMessage(this.target);
    }, reason === 'scroll' ? 60 : 25);
  }

  async revealCurrentLine() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (!this.panel || this.document !== editor.document) await this.open(editor.document);
    this.navigate(editor, 'manual');
  }

  settingsChanged() {
    if (!this.syncEnabled()) {
      if (this.navigationTimer) clearTimeout(this.navigationTimer);
      this.target = undefined;
      this.state.navigation = undefined;
    }
    if (this.panel && this.ready) void this.panel.webview.postMessage({ type: 'sync', enabled: this.syncEnabled(), clickEnabled: this.clickEnabled() });
    this.refresh();
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
    let message: RenderMessage;
    try {
      const raw = document.getText();
      const version = document.version;
      const editor = vscode.window.activeTextEditor;
      if (editor?.document === document && this.syncEnabled() && (!this.target || this.target.version !== version)) this.navigate(editor, 'cursor');
      const result = await buildPreview({ location, raw, revision, dirty: document.isDirty, documentVersion: version, syncEnabled: this.syncEnabled(),
        resourceUri: (file) => panel.webview.asWebviewUri(vscode.Uri.file(file)).toString(), readText, clickEnabled: this.clickEnabled() });
      if (revision !== this.revision || this.panel !== panel) return;
      message = result.message;
      if (this.target?.document === location.file && this.target.version === version) message.source.navigation = this.target;
      this.links = result.links;
      this.external = result.allowedExternal;
      this.renderedRaw = raw;
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

  private async revealSource(request: RevealSource) {
    const panel = this.panel;
    const displayed = this.state.message;
    const original = this.document;
    if (!panel || !original || displayed?.type !== 'update' || !this.clickEnabled()) return;
    let accepted = false;
    let activeJump: SourceJump | undefined;
    try {
      const document = original.isClosed ? await vscode.workspace.openTextDocument(original.uri) : original;
      const reopenedUnchanged = original.isClosed && document.getText() === this.renderedRaw;
      const lineLengths = document.getText().split(/\r\n|\n|\r/).map((line) => line.length);
      if (this.panel !== panel || this.document !== original || !currentSourceRequest(request, displayed, { file: document.uri.fsPath, version: reopenedUnchanged ? original.version : document.version, lineLengths }, this.lastSourceSequence)) {
        if (request.document === original.uri.fsPath && (request.version !== document.version || request.revision !== displayed.revision)) {
          this.document = document;
          this.refresh();
        }
        return;
      }
      this.lastSourceSequence = request.sequence;
      const point = new vscode.Position(request.line - 1, request.column - 1);
      const jump = { document, version: document.version, point, inFlight: true, until: Number.POSITIVE_INFINITY };
      this.sourceJump = jump;
      activeJump = jump;
      this.document = document;
      if (this.navigationTimer) clearTimeout(this.navigationTimer);
      this.navigationTimer = undefined;
      this.target = undefined;
      this.state.navigation = undefined;
      const existing = vscode.window.visibleTextEditors.find((editor) => editor.document === document);
      let column = existing?.viewColumn ?? this.editorColumn;
      if (column === panel.viewColumn) column = panel.viewColumn === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
      const editor = await vscode.window.showTextDocument(document, { viewColumn: column, preserveFocus: false, preview: false });
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      if (this.panel !== panel || this.document !== document || document.version !== jump.version || this.lastSourceSequence !== request.sequence) return;
      editor.selection = new vscode.Selection(point, point);
      if (!editor.visibleRanges.some((range) => range.contains(point))) editor.revealRange(new vscode.Range(point, point), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      this.editorColumn = editor.viewColumn ?? this.editorColumn;
      jump.inFlight = false;
      jump.until = Date.now() + 250;
      this.cursorAt = Date.now();
      // Retain this target without sending it back; the receipt's sequence is a preview barrier.
      this.target = { type: 'revealLine', document: document.uri.fsPath, version: document.version, sequence: ++this.navigationSequence, line: request.line, column: request.column, reason: 'cursor' };
      accepted = true;
      if (reopenedUnchanged) this.refresh();
    } catch { this.refresh(); }
    finally {
      if (this.sourceJump === activeJump && activeJump?.inFlight) this.sourceJump = undefined;
      const receipt: SourceNavigationReceipt = { ...request, accepted, navigationSequence: this.navigationSequence };
      if (this.panel === panel) {
        this.state.sourceNavigation = receipt;
        void panel.webview.postMessage({ type: 'sourceResult', receipt });
      }
    }
  }

  // Only the isolated Extension Host tests/development can request computed styles.
  inspectCodeStyles() {
    if (this.context.extensionMode === vscode.ExtensionMode.Production || !this.panel || !this.ready) return;
    void this.panel.webview.postMessage({ type: 'inspectCodeStyles', sequence: ++this.inspectionSequence });
  }

  testPreviewClick(action: PreviewTestClick) {
    if (this.context.extensionMode === vscode.ExtensionMode.Production || !this.panel) return;
    this.panel.reveal(this.panel.viewColumn, false);
    const panel = this.panel, sequence = ++this.testSequence;
    setTimeout(() => { if (this.panel === panel) void panel.webview.postMessage({ type: 'testPreviewClick', sequence, action }); }, 150);
  }

  async testSourceRequest(request: RevealSource) {
    if (this.context.extensionMode !== vscode.ExtensionMode.Production) await this.revealSource(request);
  }

  private html(webview: vscode.Webview) {
    const nonce = randomBytes(18).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist/webview.js'));
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist/webview.css'));
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; media-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
      <title>Sachi Blog 文章预览</title><link rel="stylesheet" href="${css}"></head>
      <body data-preview-test="${this.context.extensionMode !== vscode.ExtensionMode.Production}"><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
  }

  private close() {
    this.revision += 1;
    this.follows += 1;
    if (this.timer) clearTimeout(this.timer);
    if (this.navigationTimer) clearTimeout(this.navigationTimer);
    this.navigationTimer = undefined;
    this.target = undefined;
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
    this.state.navigation = undefined;
    this.state.codeStyles = undefined;
    this.state.sourceNavigation = undefined;
    this.state.testClick = undefined;
    this.lastSourceSequence = 0;
    this.sourceJump = undefined;
    this.renderedRaw = undefined;
  }

  dispose() { this.panel?.dispose(); this.close(); }
}

export function activate(context: vscode.ExtensionContext) {
  const preview = new Preview(context);
  context.subscriptions.push(preview,
    vscode.commands.registerCommand('sachiPreview.open', () => preview.open()),
    vscode.commands.registerCommand('sachiPreview.refresh', () => preview.refresh()),
    vscode.commands.registerCommand('sachiPreview.revealLine', () => preview.revealCurrentLine()),
    vscode.workspace.onDidChangeTextDocument((event) => preview.changed(event.document)),
    vscode.workspace.onDidSaveTextDocument((document) => preview.changed(document)),
    vscode.window.onDidChangeActiveTextEditor((editor) => { void preview.follow(editor); }),
    vscode.window.onDidChangeTextEditorSelection((event) => preview.navigate(event.textEditor, 'cursor', event.kind)),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => preview.navigate(event.textEditor, 'scroll')),
    vscode.workspace.onDidChangeConfiguration((event) => { if (event.affectsConfiguration('sachiPreview')) preview.settingsChanged(); }),
  );
  return { getPreviewState: () => preview.state, inspectCodeStyles: () => preview.inspectCodeStyles(), testPreviewClick: (action: PreviewTestClick) => preview.testPreviewClick(action), testSourceRequest: (request: RevealSource) => preview.testSourceRequest(request) };
}
