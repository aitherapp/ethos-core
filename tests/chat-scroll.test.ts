import { describe, expect, it } from 'vitest';
import { isNearScrollBottom } from '../src/lib/chatScroll';

describe('chat scroll helpers', () => {
  it('keeps auto-scroll active when the user is near the latest message', () => {
    expect(isNearScrollBottom({
      scrollTop: 920,
      clientHeight: 500,
      scrollHeight: 1450,
      threshold: 48,
    })).toBe(true);
  });

  it('disables auto-scroll when the user has scrolled up to read old messages', () => {
    expect(isNearScrollBottom({
      scrollTop: 200,
      clientHeight: 500,
      scrollHeight: 1450,
      threshold: 48,
    })).toBe(false);
  });
});
