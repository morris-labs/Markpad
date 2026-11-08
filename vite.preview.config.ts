import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { devServerOptions } from './devServer';

// Serves the renderer alone, for a quick look at the editor in a browser.
export default defineConfig({
  root: 'src/renderer',
  resolve: { alias: { '@shared': resolve('src/shared') } },
  // The preview exists to be opened from the host, so it listens on every interface.
  server: { ...devServerOptions(), host: process.env['MARKPAD_DEV_HOST'] || '0.0.0.0' },
});
