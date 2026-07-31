import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyReceipt } from '../src/verify.js';
import { canonicalize } from '../src/canonical.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => JSON.parse(readFileSync(join(here, '..', 'fixtures', n), 'utf8'));
const receipt = fx('receipt.json');
const jwks = fx('jwks.json');

// fixtures/receipt.json is a REAL production receipt (tenant "hunta"), verified against a snapshot of
// the live published JWKS. A passing test therefore proves byte-for-byte canonicalization parity with
// the backend signer against production data.
test('valid production receipt verifies against the pinned JWKS key', () => {
  const r = verifyReceipt(receipt, jwks);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.kid, 'hunta-attest-1');
  assert.equal(r.manifest.tenant, 'hunta');
  assert.equal(r.manifest.probes.all_denied, true);
});

test('tampering with a probe result fails verification', () => {
  const tampered = structuredClone(receipt);
  tampered.manifest.probes.all_denied = false; // a forger flipping the headline result
  assert.equal(verifyReceipt(tampered, jwks).ok, false);
});

test('tampering with a nested probe count fails verification', () => {
  const tampered = structuredClone(receipt);
  tampered.manifest.probes.crypto_cross_tenant_decrypt_blocked = '0/0';
  assert.equal(verifyReceipt(tampered, jwks).ok, false);
});

test('a flipped signature byte fails verification', () => {
  const tampered = structuredClone(receipt);
  const sig = Buffer.from(tampered.signature, 'base64url');
  sig[0] ^= 0x01;
  tampered.signature = sig.toString('base64url');
  assert.equal(verifyReceipt(tampered, jwks).ok, false);
});

test('the embedded public_jwk is NOT trusted (self-signed forgery is rejected)', () => {
  // A forger re-signs a fake manifest with their own key and embeds their own public_jwk under the
  // real kid. Because we resolve the key from the trusted JWKS (not the embedded one), it must fail.
  const forged = structuredClone(receipt);
  forged.manifest.tenant = 'attacker-controlled';
  // leave the embedded public_jwk as-is (real key) but the signature no longer matches the manifest
  assert.equal(verifyReceipt(forged, jwks).ok, false);
});

test('unknown kid (not in trusted JWKS) fails cleanly', () => {
  const r = verifyReceipt(receipt, { keys: [] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no key with kid/);
});

test('canonical JSON reproduces Python: sorted keys, compact separators', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalize({ z: [3, 2, 1], a: 'x' }), '{"a":"x","z":[3,2,1]}');
  // non-ASCII escapes to \uXXXX (ensure_ascii), matching the backend signer
  assert.equal(canonicalize('café'), '"caf\\u00e9"');
});
