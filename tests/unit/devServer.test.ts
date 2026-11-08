import { describe, expect, it } from 'vitest';
import { devServerOptions } from '../../devServer';

describe('devServerOptions', () => {
  it('binds to loopback by default', () => {
    expect(devServerOptions({}).host).toBe('127.0.0.1');
  });

  it('honors MARKPAD_DEV_HOST', () => {
    expect(devServerOptions({ MARKPAD_DEV_HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });
});
