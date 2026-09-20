import { describe, expect, it, vi } from 'vitest';
import { deliverWidgetOutbound } from '../src/widget/deliverOutbound';

describe('deliverWidgetOutbound', () => {
  it('sends immediately when transport is up, then wakes with the real message id', async () => {
    const wake = vi.fn(async () => true);
    const send = vi.fn(async () => ({ id: 'msg-1' }));

    const result = await deliverWidgetOutbound({
      isTransportUsable: () => true,
      wake,
      send,
    });

    expect(result).toEqual({ ok: true, messageId: 'msg-1' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith('msg-1');
  });

  it('wakes and retries when the first send fails, then delivers after transport comes up', async () => {
    let usable = false;
    const wake = vi.fn(async () => true);
    const send = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'msg-2' });
    const sleep = vi.fn(async () => {
      usable = true;
    });

    const result = await deliverWidgetOutbound({
      isTransportUsable: () => usable,
      wake,
      send,
      waitMs: 1000,
      pollMs: 10,
      sleep,
    });

    expect(result).toEqual({ ok: true, messageId: 'msg-2' });
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith(expect.stringMatching(/^widget-wake-/));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('returns ok:false when wake+wait still cannot deliver', async () => {
    const result = await deliverWidgetOutbound({
      isTransportUsable: () => false,
      wake: async () => true,
      send: async () => null,
      waitMs: 30,
      pollMs: 10,
      sleep: async () => {},
    });

    expect(result).toEqual({ ok: false });
  });
});
