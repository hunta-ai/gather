#!/usr/bin/env node
// hunta-verify: prove a Hunta memory store's isolation attestation in one command.
//
//   npx @hunta/verify ./receipt.json                 # pin the key from the live published JWKS
//   npx @hunta/verify ./receipt.json --jwks jwks.json # fully offline, pin from a saved JWKS
//   npx @hunta/verify ./receipt.json --json           # machine-readable result
//
// Exit code 0 = PASS, 1 = FAIL/error. No dependencies; the whole verifier is auditable in src/.

import { readFileSync } from 'node:fs';
import { verifyReceipt } from './verify.js';

const JWKS_URL = 'https://mcp.hunta.ai/.well-known/jwks.json';

function parseArgs(argv) {
  const a = { receipt: null, jwks: null, url: JWKS_URL, json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--jwks') a.jwks = argv[++i];
    else if (t === '--url') a.url = argv[++i];
    else if (t === '--json') a.json = true;
    else if (t === '-h' || t === '--help') a.help = true;
    else if (!a.receipt) a.receipt = t;
  }
  return a;
}

const HELP = `hunta-verify — offline Ed25519 verification of a Hunta isolation-attestation receipt

Usage:
  hunta-verify <receipt.json> [--jwks <file>] [--url <jwks-url>] [--json]

The signature is checked against a key PINNED from Hunta's published JWKS (default ${JWKS_URL}),
resolved by the receipt's attest_kid. The key embedded in the receipt is never trusted.`;

async function loadJwks(args) {
  if (args.jwks) return JSON.parse(readFileSync(args.jwks, 'utf8'));
  const res = await fetch(args.url);
  if (!res.ok) throw new Error(`could not fetch JWKS from ${args.url} (HTTP ${res.status})`);
  return res.json();
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.receipt) {
    console.log(HELP);
    process.exit(args.receipt ? 0 : 2);
  }

  let receipt, jwks;
  try {
    receipt = JSON.parse(readFileSync(args.receipt, 'utf8'));
  } catch (e) {
    console.error(`cannot read receipt "${args.receipt}": ${e.message}`);
    process.exit(1);
  }
  try {
    jwks = await loadJwks(args);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const r = verifyReceipt(receipt, jwks);
  const m = r.manifest || {};

  if (args.json) {
    const pj = m.probes || {};
    console.log(JSON.stringify({ ok: r.ok, kid: r.kid, reason: r.reason, tenant: m.tenant,
      build: m.build, ts: m.ts, conclusive: pj.conclusive, all_denied: pj.all_denied }, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  const src = args.jwks ? `pinned from ${args.jwks}` : `pinned from ${args.url}`;
  const p = m.probes || {};
  if (r.ok) {
    console.log(`PASS  isolation attestation verified`);
    console.log(`  signature   valid Ed25519, kid ${r.kid} (${src})`);
    console.log(`  tenant      ${m.tenant ?? '?'}`);
    console.log(`  build       ${m.build ?? '?'}   probe set ${m.probe_set_version ?? '?'}`);
    console.log(`  signed at   ${m.ts ?? '?'}   nonce ${m.nonce ?? '?'}`);
    console.log(`  conclusive  ${p.conclusive === true}   all boundaries held  ${p.all_denied === true}`);
    for (const [label, probe] of [
      ['physical (GRANT)', p.physical_cross_schema_grant_denied],
      ['logical (RLS)', p.logical_rls_hides_wrong_tenant],
      ['crypto (per-col)', p.crypto_cross_tenant_decrypt_blocked],
      ['dedup-hmac', p.dedup_hmac_key_separated]]) {
      if (probe !== undefined) console.log(`    ${pad(label, 18)} ${JSON.stringify(probe)}`);
    }
    process.exit(0);
  }
  console.log(`FAIL  isolation attestation NOT verified`);
  console.log(`  reason      ${r.reason}`);
  console.log(`  kid         ${r.kid || '(none declared)'} (${src})`);
  process.exit(1);
}

main();
