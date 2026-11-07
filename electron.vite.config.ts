import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { devServerOptions } from './devServer';

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Sandboxed preload scripts must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } },
    },
    resolve: { alias: { '@shared': resolve('src/shared') } },
    server: devServerOptions(),
  },
});
