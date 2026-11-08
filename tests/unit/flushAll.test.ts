import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app';

describe('App.flushAll', () => {
  it('returns true when the session save rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = Object.create(App.prototype) as App;
    const state = app as unknown as Record<string, unknown>;
    state['tabs'] = [{ flush: async () => true }];
    state['saveSession'] = async () => {
      throw new Error('disk full');
    };
    await expect(app.flushAll()).resolves.toBe(true);
  });
});
