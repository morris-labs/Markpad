import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloseGuard } from '../../src/main/closeGuard';

describe('CloseGuard', () => {
  afterEach(() => vi.useRealTimers());

  it('forces the close when the renderer never replies', () => {
    vi.useFakeTimers();
    const force = vi.fn();
    const guard = new CloseGuard(1000, force);
    guard.arm();
    guard.arm();
    vi.advanceTimersByTime(1000);
    expect(force).toHaveBeenCalledTimes(1);
  });

  it('does not force the close after disarm', () => {
    vi.useFakeTimers();
    const force = vi.fn();
    const guard = new CloseGuard(1000, force);
    guard.arm();
    guard.disarm();
    vi.advanceTimersByTime(5000);
    expect(force).not.toHaveBeenCalled();
  });
});
