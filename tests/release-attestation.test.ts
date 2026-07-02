import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { enrichReleaseManifest } from '../scripts/enrich-release-manifest.mjs';

describe('release manifest attestation enrichment', () => {
  it('records GitHub attestation metadata without changing artifact hashes', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'ethos-attest-manifest-'));
    const manifestPath = path.join(repoRoot, 'dist', 'trust', 'release-manifest.json');

    try {
      await mkdir(path.dirname(manifestPath), { recursive: true });
      await writeFile(
        manifestPath,
        `${JSON.stringify({
          schemaVersion: 1,
          source: { repository: 'aitherapp/ethos-core', commit: 'abc123' },
          artifacts: [{ path: 'index.html', sha256: 'deadbeef', bytes: 12 }],
        }, null, 2)}\n`,
      );

      const manifest = await enrichReleaseManifest({
        manifestPath,
        attestationId: '123456',
        attestationUrl: 'https://github.com/aitherapp/ethos-core/attestations/123456',
        repository: 'aitherapp/ethos-core',
      });

      expect(manifest.provenance.githubArtifactAttestation).toEqual({
        id: '123456',
        url: 'https://github.com/aitherapp/ethos-core/attestations/123456',
        repository: 'aitherapp/ethos-core',
        verifyCommand: 'while read -r digest file; do gh attestation verify "$file" --repo aitherapp/ethos-core; done < trust/SHA256SUMS',
      });

      const persisted = JSON.parse(await readFile(manifestPath, 'utf8'));
      expect(persisted.provenance.githubArtifactAttestation.url).toContain('/attestations/123456');
      expect(persisted.artifacts).toEqual([{ path: 'index.html', sha256: 'deadbeef', bytes: 12 }]);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
