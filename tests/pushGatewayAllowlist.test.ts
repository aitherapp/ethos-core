import { describe, it, expect } from 'vitest';
import { isAllowedPushEndpointHost } from '../push-gateway/src/allowlist';
import { extractBearerToken, timingSafeEqualString } from '../push-gateway/src/auth';
import {
  subscriptionKvKey,
  validateSubscriptionPayload,
  validatePushPayload,
  MAX_TITLE_LEN,
  MAX_BODY_LEN,
  MAX_NOTIFICATION_DATA_JSON_LEN,
  notificationDataJsonLength,
} from '../push-gateway/src/subscriptions';

describe('push endpoint allowlist', () => {
  it('allows known Web Push hosts', () => {
    expect(isAllowedPushEndpointHost('https://web.push.apple.com/foo')).toBe(true);
    expect(isAllowedPushEndpointHost('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpointHost('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedPushEndpointHost('https://push.services.mozilla.com/wpush/v1/x')).toBe(true);
  });

  it('rejects non-push hosts', () => {
    expect(isAllowedPushEndpointHost('https://evil.example/steal')).toBe(false);
    expect(isAllowedPushEndpointHost('http://web.push.apple.com/foo')).toBe(false);
  });

  it('rejects lookalike hosts and non-https', () => {
    expect(isAllowedPushEndpointHost('https://evil.web.push.apple.com/foo')).toBe(false);
    expect(isAllowedPushEndpointHost('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isAllowedPushEndpointHost('not-a-url')).toBe(false);
    expect(isAllowedPushEndpointHost('')).toBe(false);
  });
});

describe('auth helpers', () => {
  it('extracts Bearer token', () => {
    expect(extractBearerToken('Bearer secret-token')).toBe('secret-token');
    expect(extractBearerToken('bearer secret-token')).toBe('secret-token');
    expect(extractBearerToken('Basic x')).toBe(null);
    expect(extractBearerToken(null)).toBe(null);
    expect(extractBearerToken('')).toBe(null);
  });

  it('compares tokens in constant-time style', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
    expect(timingSafeEqualString('abc', 'ab')).toBe(false);
  });
});

describe('subscription / push payload helpers', () => {
  it('builds stable KV keys under token namespace', async () => {
    const a = await subscriptionKvKey('tok', 'https://web.push.apple.com/a');
    const b = await subscriptionKvKey('tok', 'https://web.push.apple.com/a');
    const c = await subscriptionKvKey('tok', 'https://web.push.apple.com/b');
    const other = await subscriptionKvKey('other', 'https://web.push.apple.com/a');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(other);
    expect(a.startsWith('sub:')).toBe(true);
  });

  it('validates subscription payload shape and allowlist', () => {
    const ok = validateSubscriptionPayload({
      endpoint: 'https://web.push.apple.com/foo',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(ok.ok).toBe(true);

    const badHost = validateSubscriptionPayload({
      endpoint: 'https://evil.example/x',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(badHost.ok).toBe(false);

    const missingKeys = validateSubscriptionPayload({
      endpoint: 'https://web.push.apple.com/foo',
      keys: { p256dh: '', auth: 'a' },
    });
    expect(missingKeys.ok).toBe(false);
  });

  it('enforces title/body max lengths for push payload', () => {
    const ok = validatePushPayload({
      endpoint: 'https://web.push.apple.com/foo',
      keys: { p256dh: 'p', auth: 'a' },
      notification: { title: 'Hi', body: 'There', data: { messageId: '1' } },
    });
    expect(ok.ok).toBe(true);

    const longTitle = validatePushPayload({
      endpoint: 'https://web.push.apple.com/foo',
      keys: { p256dh: 'p', auth: 'a' },
      notification: { title: 'x'.repeat(MAX_TITLE_LEN + 1), body: 'ok' },
    });
    expect(longTitle.ok).toBe(false);

    const longBody = validatePushPayload({
      endpoint: 'https://web.push.apple.com/foo',
      keys: { p256dh: 'p', auth: 'a' },
      notification: { title: 'ok', body: 'y'.repeat(MAX_BODY_LEN + 1) },
    });
    expect(longBody.ok).toBe(false);
  });

  it('caps notification.data serialized size', () => {
    expect(notificationDataJsonLength(undefined)).toBe(0);
    expect(notificationDataJsonLength({ messageId: '1' })).toBeLessThanOrEqual(
      MAX_NOTIFICATION_DATA_JSON_LEN,
    );

    const huge = { blob: 'x'.repeat(MAX_NOTIFICATION_DATA_JSON_LEN) };
    expect(notificationDataJsonLength(huge)).toBeGreaterThan(MAX_NOTIFICATION_DATA_JSON_LEN);

    const rejected = validatePushPayload({
      endpoint: 'https://web.push.apple.com/foo',
      keys: { p256dh: 'p', auth: 'a' },
      notification: { title: 'ok', body: 'ok', data: huge },
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok === false) {
      expect(rejected.error).toBe('payload_too_large');
    }
  });
});
