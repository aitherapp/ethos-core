import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { writeReleaseReceipt } from '../scripts/write-release-receipt.mjs';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function withTempRepo(test: (repoRoot: string, distDir: string) => Promise<void>) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'ethos-release-receipt-'));
  const distDir = path.join(repoRoot, 'dist');

  try {
    await test(repoRoot, distDir);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

describe('release receipt generation', () => {
  it('writes sorted SHA-256 sums for app artifacts and excludes generated receipt files', async () => {
    await withTempRepo(async (repoRoot, distDir) => {
      await mkdir(path.join(distDir, 'assets'), { recursive: true });
      await mkdir(path.join(distDir, 'trust'), { recursive: true });
      await writeFile(path.join(repoRoot, 'package-lock.json'), '{"lockfileVersion":3}\n');
      await writeFile(path.join(distDir, 'index.html'), '<div>ETHOS</div>');
      await writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log("ethos");');
      await writeFile(path.join(distDir, 'trust', 'canary.txt'), 'canary');
      await writeFile(path.join(distDir, 'trust', 'release-manifest.json'), 'old manifest');
      await writeFile(path.join(distDir, 'trust', 'SHA256SUMS'), 'old sums');

      const manifest = await writeReleaseReceipt({
        distDir,
        repoRoot,
        generatedAt: '2026-06-14T16:00:00.000Z',
        env: {
          GITHUB_REPOSITORY: 'aitherapp/ethos-core',
          GITHUB_SHA: 'abc123',
          GITHUB_REF_NAME: 'main',
          GITHUB_RUN_ID: '99',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_SERVER_URL: 'https://github.com',
        },
        npmVersion: '10.0.0',
      });

      expect(manifest.artifacts.map(artifact => artifact.path)).toEqual([
        'assets/app.js',
        'index.html',
        'trust/canary.txt',
      ]);
      expect(manifest.lockfile.sha256).toBe(sha256('{"lockfileVersion":3}\n'));

      const sums = await readFile(path.join(distDir, 'trust', 'SHA256SUMS'), 'utf8');
      expect(sums).toBe([
        `${sha256('console.log("ethos");')}  assets/app.js`,
        `${sha256('<div>ETHOS</div>')}  index.html`,
        `${sha256('canary')}  trust/canary.txt`,
        '',
      ].join('\n'));

      const manifestJson = JSON.parse(await readFile(path.join(distDir, 'trust', 'release-manifest.json'), 'utf8'));
      expect(manifestJson.source).toMatchObject({
        repository: 'aitherapp/ethos-core',
        commit: 'abc123',
        ref: 'main',
      });
      expect(manifestJson.build).toMatchObject({
        npm: '10.0.0',
        runId: '99',
        runAttempt: '1',
      });
    });
  });
});
