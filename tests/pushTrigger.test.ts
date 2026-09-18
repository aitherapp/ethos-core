// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { sendDirectWebPush } from '../src/widget/pushTrigger';

describe('Widget Direct Web Push', () => {
  it('should return false gracefully if no push endpoint is configured', async () => {
    const result = await sendDirectWebPush(null, 'Visitor #1', '/pricing', 'Hi');
    expect(result).toBe(false);
  });
});
