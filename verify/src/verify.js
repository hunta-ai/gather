// Offline verifier for Hunta isolation-attestation receipts.
//
// Trust model ("verify, don't trust"): the signature is checked against a key PINNED from Hunta's
// published JWKS (https://mcp.hunta.ai/.well-known/jwks.json), resolved by the receipt's declared
// attest_kid. The public_jwk embedded in the receipt is IGNORED for trust: a forger controls it, so
// trusting it would let any self-signed manifest pass. Only node:crypto is used (no dependencies).

import { createPublicKey, verify as edVerify } from 'node:crypto';
import { canonicalize } from './canonical.js';

function b64u(s) {
  return Buffer.from(s, 'base64url');
}

/** Resolve the Ed25519 public key for `kid` from a trusted JWKS document. Throws if absent/unexpected. */
export function pinnedKey(jwks, kid) {
  const key = (jwks && Array.isArray(jwks.keys) ? jwks.keys : []).find((k) => k.kid === kid);
  if (!key) throw new Error(`no key with kid="${kid}" in the trusted JWKS`);
  if (key.kty !== 'OKP' || key.crv !== 'Ed25519') {
    throw new Error(`key "${kid}" is not an Ed25519 OKP key`);
  }
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.x }, format: 'jwk' });
}

/**
 * Verify a signed isolation receipt against a trusted JWKS.
 * @param {object} receipt  the {manifest, alg, signature, public_jwk} blob
 * @param {object} jwks     the trusted JWKS ({keys:[...]}) fetched/pinned from mcp.hunta.ai
 * @returns {{ok:boolean, kid:string, reason?:string, manifest:object}}
 */
export function verifyReceipt(receipt, jwks) {
  const manifest = receipt && receipt.manifest;
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, kid: '', reason: 'receipt has no manifest', manifest: {} };
  }
  if (receipt.alg && receipt.alg !== 'Ed25519') {
    return { ok: false, kid: '', reason: `unexpected alg "${receipt.alg}"`, manifest };
  }
  if (typeof receipt.signature !== 'string') {
    return { ok: false, kid: '', reason: 'receipt has no signature', manifest };
  }
  // Pin by the kid the receipt claims it was signed under, resolved in the TRUSTED jwks (never the
  // embedded public_jwk). An unknown kid, or a signature made by any other key, fails.
  const kid = manifest.attest_kid || (receipt.public_jwk && receipt.public_jwk.kid);
  if (!kid) return { ok: false, kid: '', reason: 'receipt declares no attest_kid', manifest };

  let key;
  try {
    key = pinnedKey(jwks, kid);
  } catch (e) {
    return { ok: false, kid, reason: e.message, manifest };
  }

  let ok = false;
  try {
    ok = edVerify(null, Buffer.from(canonicalize(manifest), 'utf8'), key, b64u(receipt.signature));
  } catch (e) {
    return { ok: false, kid, reason: 'verification error: ' + e.message, manifest };
  }
  return { ok, kid, reason: ok ? undefined : 'signature does not match the pinned key', manifest };
}
