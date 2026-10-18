import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  // 工作区内的共享包直接打进产物；第三方依赖保持外部引用
  noExternal: ['@invest-insight/shared'],
  banner: { js: '#!/usr/bin/env node' },
});
