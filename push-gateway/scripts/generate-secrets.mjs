#!/usr/bin/env node
/**
 * Generate AUTH_TOKEN + VAPID keypair for the ETHOS push gateway.
 * Print values for `wrangler secret put` — never commit the output.
 *
 * Usage: node scripts/generate-secrets.mjs
 */
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

function randomToken(bytes = 32) {
  return Buffer.from(webcrypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');
}

async function generateVapidKeys() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const privJwk = await subtle.exportKey('jwk', pair.privateKey);
  const pubRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));

  if (!privJwk.d) {
    throw new Error('Failed to export VAPID private key');
  }

  // Application server keys: uncompressed public point + private scalar (base64url)
  const publicKey = Buffer.from(pubRaw).toString('base64url');
  const privateKey = privJwk.d; // already base64url

  // Sanity: private scalar should decode to 32 bytes
  if (b64urlToBytes(privateKey).length !== 32) {
    throw new Error('Unexpected VAPID private key length');
  }
  if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) {
    throw new Error('Unexpected VAPID public key format');
  }

  return { publicKey, privateKey };
}

const AUTH_TOKEN = randomToken(32);
const { publicKey, privateKey } = await generateVapidKeys();

console.log(`
ETHOS push-gateway secrets (do not commit; store only in Cloudflare Secrets)

AUTH_TOKEN:
${AUTH_TOKEN}

VAPID_PUBLIC_KEY:
${publicKey}

VAPID_PRIVATE_KEY:
${privateKey}

Set them with:

  cd push-gateway
  printf '%s' '${AUTH_TOKEN}' | npx wrangler secret put AUTH_TOKEN
  printf '%s' '${publicKey}' | npx wrangler secret put VAPID_PUBLIC_KEY
  printf '%s' '${privateKey}' | npx wrangler secret put VAPID_PRIVATE_KEY

Optional subject (mailto or https):

  printf '%s' 'mailto:you@example.com' | npx wrangler secret put VAPID_SUBJECT

Then paste your Worker HTTPS URL and AUTH_TOKEN into ETHOS Settings
(Enable background push → Push gateway URL + token).
`);
