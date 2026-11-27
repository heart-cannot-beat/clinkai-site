import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // design/ 是设计交接包，以设计侧导出为准，不在这里检查；
  // .claude/ 里是并行 agent 的 worktree，各自跑各自的检查
  globalIgnores(['dist/', '.astro/', '.wrangler/', 'design/', '.claude/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
]);
