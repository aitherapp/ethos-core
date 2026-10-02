import { describe, it, expect } from 'vitest';
import {
  extractRelayToken,
  isAuthorizedRelayRequest,
  tokensEqual,
} from '../relay/src/auth';

describe('relay auth', () => {
  it('reads token from query', () => {
    const req = new Request('https://r.example/?token=abc');
    expect(extractRelayToken(req)).toBe('abc');
    expect(isAuthorizedRelayRequest(req, 'abc')).toBe(true);
    expect(isAuthorizedRelayRequest(req, 'nope')).toBe(false);
  });

  it('reads Bearer token', () => {
    const req = new Request('https://r.example/', {
      headers: { Authorization: 'Bearer xyz' },
    });
    expect(extractRelayToken(req)).toBe('xyz');
  });

  it('prefers query token over Bearer', () => {
    const req = new Request('https://r.example/?token=query', {
      headers: { Authorization: 'Bearer header' },
    });
    expect(extractRelayToken(req)).toBe('query');
  });

  it('rejects missing token', () => {
    const req = new Request('https://r.example/');
    expect(isAuthorizedRelayRequest(req, 'abc')).toBe(false);
  });

  it('compares tokens in constant-time style', () => {
    expect(tokensEqual('abc', 'abc')).toBe(true);
    expect(tokensEqual('abc', 'abd')).toBe(false);
    expect(tokensEqual('abc', 'ab')).toBe(false);
  });
});
