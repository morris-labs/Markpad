// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { devServerOptions } from '../../devServer';

describe('devServerOptions', () => {
  it('binds to loopback by default', () => {
    expect(devServerOptions({}).host).toBe('127.0.0.1');
  });

  it('honors MARKPAD_DEV_HOST', () => {
    expect(devServerOptions({ MARKPAD_DEV_HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });
});

describe('vite.preview.config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('binds to loopback when MARKPAD_DEV_HOST is unset', async () => {
    vi.stubEnv('MARKPAD_DEV_HOST', '');
    const config = (await import('../../vite.preview.config')).default;
    expect(config.server?.host).toBe('127.0.0.1');
  });

  it('honors MARKPAD_DEV_HOST', async () => {
    vi.stubEnv('MARKPAD_DEV_HOST', '0.0.0.0');
    const config = (await import('../../vite.preview.config')).default;
    expect(config.server?.host).toBe('0.0.0.0');
  });
});
