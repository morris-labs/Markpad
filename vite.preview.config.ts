import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Serves the renderer alone, for a quick look at the editor in a browser.
export default defineConfig({
  root: 'src/renderer',
  resolve: { alias: { '@shared': resolve('src/shared') } },
  server: { host: '0.0.0.0', port: 20390, strictPort: true },
});
