import { defineConfig } from 'vitepress';
import { navigation } from './navigation';
import { tokenizeChinese } from './search';
import { fileURLToPath } from 'node:url';
import { docsBase } from './settings';

const base = docsBase();

export default defineConfig({
  lang: 'zh-CN', title: 'Sachi · CLI 使用手册',
  description: '请叫我木头人：从本地 Markdown 写作到明确发布，一项任务，一页说明。',
  base, cleanUrls: false, appearance: false,
  markdown: { codeCopyButtonTitle: '复制代码' },
  srcExclude: ['README.md'],
  head: [['meta', { name: 'theme-color', content: '#faf8f2' }], ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }]],
  vite: {
    define: { 'process.env.NEXT_PUBLIC_BLOG_BASE_PATH': JSON.stringify('') },
    plugins: [{
      name: 'sachi-documentation-react-components', enforce: 'pre',
      transform(code, id) {
        if (!/\/src\/components\/(?:CodeBlock|FlowParagraphs)\.tsx(?:\?|$)/.test(id)) return;
        // Next's directive is meaningful in the blog build, not in this Vue-hosted preview.
        return { code: code.replace(/^(['"])use client\1;?/, (directive) => ' '.repeat(directive.length)), map: null };
      },
    }],
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) }, dedupe: ['react', 'react-dom'] },
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  },
  themeConfig: {
    siteTitle: 'Sachi / 使用手册',
    skipToContentLabel: '跳到正文',
    nav: [
      { text: '开始使用', link: '/start/install' },
      { text: '写作', link: '/writing/new' },
      { text: '发布', link: '/release/publish' },
      { text: '命令参考', link: '/reference/commands' },
    ],
    sidebar: navigation,
    outline: { level: [2, 3], label: '本页步骤' },
    sidebarMenuLabel: '操作目录', returnToTopLabel: '回到顶部',
    docFooter: { prev: '上一项操作', next: '下一项操作' },
    darkModeSwitchLabel: '外观',
    search: { provider: 'local', options: {
      miniSearch: { options: {
        tokenize: tokenizeChinese,
      } },
      translations: {
        button: { buttonText: '搜索操作或命令', buttonAriaLabel: '搜索 CLI 手册' },
        modal: { displayDetails: '显示详情', resetButtonTitle: '清除搜索', backButtonTitle: '关闭搜索',
          noResultsText: '没有找到相关操作', footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } },
      },
    } },
    notFound: { title: '这一页不在手册里', quote: '从操作目录继续，或搜索你想执行的命令。', linkLabel: '返回手册首页', linkText: '返回手册首页' },
  },
});
