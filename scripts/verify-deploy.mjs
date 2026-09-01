
import { readFile } from 'fs/promises';
import { join } from 'path';

const VERSION = '3.1.73';
const DIST_PATH = './dist';

async function verify() {
  console.log(`Verifying deployment artifacts for version ${VERSION}...`);
  
  // 1. Check index.html manifest version
  const indexHtml = await readFile(join(DIST_PATH, 'index.html'), 'utf8');
  if (!indexHtml.includes(`manifest.webmanifest?v=${VERSION}`)) {
    throw new Error('index.html manifest version mismatch');
  }

  // 2. Check sw.js cache name
  const swJs = await readFile(join(DIST_PATH, 'sw.js'), 'utf8');
  if (!swJs.includes(`'ethos-v${VERSION}'`)) {
    throw new Error('sw.js CACHE_NAME mismatch');
  }

  console.log('✅ Cache-busting verification passed.');
}

verify().catch(err => {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
});
