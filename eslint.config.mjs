import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    '.next/**',
    '.next-fixtures-dev/**',
    'out/**',
    '.blog/**',
    '.blog-store/**',
    'mutouren-ui-kit/**',
    'docs-site/.vitepress/cache/**',
    'docs-site/.vitepress/.temp/**',
    'docs-site/.vitepress/dist/**',
    'docs-site/node_modules/**',
    'tools/vscode-preview/dist/**',
    'tools/vscode-preview/.test-host/**',
  ]),
]);
