import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function enrichReleaseManifest({
  manifestPath = path.resolve('dist/trust/release-manifest.json'),
  attestationId = process.env.ATTESTATION_ID ?? null,
  attestationUrl = process.env.ATTESTATION_URL ?? null,
  repository = process.env.GITHUB_REPOSITORY ?? null,
} = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  manifest.provenance = {
    githubArtifactAttestation: {
      id: attestationId,
      url: attestationUrl,
      repository,
      verifyCommand: repository
        ? `while read -r digest file; do gh attestation verify "$file" --repo ${repository}; done < trust/SHA256SUMS`
        : 'gh attestation verify <release-file> --repo <owner>/<repo>',
    },
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await enrichReleaseManifest();
}
