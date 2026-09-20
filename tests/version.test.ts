// tests/version.test.ts
import { describe, it, expect } from 'vitest';
import { APP_VERSION } from '../src/version';
import pkg from '../package.json';

describe('APP_VERSION', () => {
  it('matches package.json version', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});
