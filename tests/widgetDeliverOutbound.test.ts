import { describe, expect, it, vi } from 'vitest';
import { deliverWidgetOutbound } from '../src/widget/deliverOutbound';

describe('deliverWidgetOutbound', () => {
  it('always wakes first, invalidates zombie transport, then sends after usable', async () => {
    let usable = true; // zombie "relay connected" looks usable before invalidate
    const wake = vi.fn(async () => true);
    const prepareForRetry = vi.fn(() => {
      usable = false;
    });
    const send = vi.fn(async () => {
      if (!usable) return null;
      return { id: 'msg-1' };
    });
    const sleep = vi.fn(async () => {
      usable = true; // peer woke and re-handshaked
    });

    const result = await deliverWidgetOutbound({
      isTransportUsable: () => usable,
      wake,
      send,
      prepareForRetry,
      waitMs: 1000,
      pollMs: 10,
      sleep,
    });

    expect(result).toEqual({ ok: true, messageId: 'msg-1' });
    expect(wake).toHaveBeenNthCalledWith(1, expect.stringMatching(/^widget-wake-/));
    expect(prepareForRetry).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenNthCalledWith(2, 'msg-1');
    // Must not send before prepareForRetry cleared the zombie usable flag.
    expect(prepareForRetry.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
  });

  it('wakes, waits until transport is usable, then delivers', async () => {
    let usable = false;
    const wake = vi.fn(async () => true);
    const send = vi.fn(async () => (usable ? { id: 'msg-2' } : null));
    const sleep = vi.fn(async () => {
      usable = true;
    });

    const result = await deliverWidgetOutbound({
      isTransportUsable: () => usable,
      wake,
      send,
      prepareForRetry: () => {},
      waitMs: 1000,
      pollMs: 10,
      sleep,
    });

    expect(result).toEqual({ ok: true, messageId: 'msg-2' });
    expect(wake).toHaveBeenCalledTimes(2);
    expect(wake).toHaveBeenNthCalledWith(1, expect.stringMatching(/^widget-wake-/));
    expect(wake).toHaveBeenNthCalledWith(2, 'msg-2');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns ok:false when wake+wait still cannot deliver', async () => {
    const result = await deliverWidgetOutbound({
      isTransportUsable: () => false,
      wake: async () => true,
      send: async () => null,
      prepareForRetry: () => {},
      waitMs: 30,
      pollMs: 10,
      sleep: async () => {},
    });

    expect(result).toEqual({ ok: false });
  });
});
