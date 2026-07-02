import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RECEIPT_PATHS = new Set([
  'trust/release-manifest.json',
  'trust/SHA256SUMS',
]);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function listFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(rootDir, absolutePath));
      continue;
    }

    if (!entry.isFile()) continue;
    const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
    if (!RECEIPT_PATHS.has(relativePath)) files.push(relativePath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function npmVersionFromEnv(env) {
  const userAgent = env.npm_config_user_agent ?? '';
  const match = userAgent.match(/npm\/([^\s]+)/);
  return match?.[1] ?? 'unknown';
}

export async function writeReleaseReceipt({
  distDir = path.resolve('dist'),
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  npmVersion = npmVersionFromEnv(env),
} = {}) {
  await stat(distDir);

  const lockfilePath = path.join(repoRoot, 'package-lock.json');
  const lockfile = await readFile(lockfilePath);
  const artifactPaths = await listFiles(distDir);
  const artifacts = [];

  for (const artifactPath of artifactPaths) {
    const contents = await readFile(path.join(distDir, artifactPath));
    artifacts.push({
      path: artifactPath,
      sha256: sha256(contents),
      bytes: contents.byteLength,
    });
  }

  const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : null;

  const manifest = {
    schemaVersion: 1,
    generatedAt,
    source: {
      repository: env.GITHUB_REPOSITORY ?? 'unknown',
      commit: env.GITHUB_SHA ?? 'unknown',
      ref: env.GITHUB_REF_NAME ?? env.GITHUB_REF ?? 'unknown',
    },
    build: {
      node: process.version,
      npm: npmVersion,
      runId: env.GITHUB_RUN_ID ?? null,
      runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
      runUrl,
    },
    lockfile: {
      path: 'package-lock.json',
      sha256: sha256(lockfile),
    },
    artifacts,
  };

  const trustDir = path.join(distDir, 'trust');
  await mkdir(trustDir, { recursive: true });
  await writeFile(
    path.join(trustDir, 'release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    path.join(trustDir, 'SHA256SUMS'),
    `${artifacts.map(artifact => `${artifact.sha256}  ${artifact.path}`).join('\n')}\n`,
  );

  return manifest;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await writeReleaseReceipt();
}
