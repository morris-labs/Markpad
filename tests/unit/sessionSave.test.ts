import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app';

function makeApp(tabCount: number) {
  const app = Object.create(App.prototype) as App;
  const state = app as unknown as Record<string, unknown>;
  state['tabs'] = Array.from({ length: tabCount }, () => ({ sessionEntry: {} }));
  state['sessionSaves'] = Promise.resolve();
  state['restoring'] = false;
  return { app, state };
}

describe('App.saveSession', () => {
  it('skips saves while tabs are restoring', async () => {
    const save = vi.fn(async () => {});
    vi.stubGlobal('window', { markpad: { saveSession: save } });
    const { app, state } = makeApp(1);
    state['restoring'] = true;
    await (app as unknown as { saveSession(): Promise<void> }).saveSession();
    expect(save).not.toHaveBeenCalled();
  });

  it('runs saves one at a time with the newest snapshot last', async () => {
    const calls: number[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    vi.stubGlobal('window', {
      markpad: {
        saveSession: async (session: { tabs: unknown[] }) => {
          calls.push(session.tabs.length);
          if (first) {
            first = false;
            await gate;
          }
        },
      },
    });
    const { app, state } = makeApp(1);
    const save = () => (app as unknown as { saveSession(): Promise<void> }).saveSession();
    const a = save();
    await Promise.resolve();
    (state['tabs'] as unknown[]).push({ sessionEntry: {} });
    const b = save();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([1]);
    release();
    await Promise.all([a, b]);
    expect(calls).toEqual([1, 2]);
  });
});
