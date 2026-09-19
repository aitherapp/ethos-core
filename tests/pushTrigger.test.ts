import { describe, it, expect } from 'vitest';
import { sendDirectWebPush } from '../src/widget/pushTrigger';

describe('Widget Direct Web Push', () => {
  it('should return false gracefully if no push endpoint is configured', async () => {
    const result = await sendDirectWebPush(null, 'Visitor #1', '/pricing', 'Hi');
    expect(result).toBe(false);
  });

  it('should construct push payload structure correctly', async () => {
    let capturedUrl = '';
    let capturedBody = '';

    // Mock fetch
    const mockFetch = async (url: string, init: any) => {
      capturedUrl = url;
      capturedBody = init.body;
      return { ok: true, status: 201 } as any;
    };

    const result = await sendDirectWebPush('https://push.apple.com/test', 'Visitor #1234', '/marketplace', 'Hello!', mockFetch as any);
    expect(result).toBe(true);
    expect(capturedUrl).toBe('https://push.apple.com/test');
    expect(capturedBody).toContain('Visitor #1234');
    expect(capturedBody).toContain('/marketplace');
  });
});
