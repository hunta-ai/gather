#!/usr/bin/env node
// The hunta CLI. Verbs read as the pipeline: gather -> curate -> recall, with instinct as the
// reflex set and verify as the proof. `remember` is a quiet alias of `gather` for familiarity.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { verifyReceipt } from '@hunta/verify';
import { HuntaClient, HuntaError } from './client.js';
import { resolve, writeConfig, readConfig, DEFAULT_URL } from './config.js';

const VERSION = createRequire(import.meta.url)('../package.json').version;

const HELP = `hunta ${VERSION} — attestable, curated memory for AI agents (hunta.ai)

Usage:
  hunta gather "<text>" [--valid-from DATE]   governed write into your memory
  hunta recall "<query>" [--as-of DATE] [--limit N] [--entity NAME]
                                              search sealed facts, with provenance
  hunta verify [receipt.json] [--jwks FILE]   prove the isolation attestation
                                              (no file: runs a live probe first)
  hunta instinct [--action NAME]              the standing reflex set
  hunta login --key KEY [--url URL]           store your key (~/.config/hunta)

Options:
  --json          machine-readable output      --url URL    override the API base
  --key KEY       override the bearer key      -h, --help   this help
  -v, --version   print the version

Keys come from the console: https://console.hunta.cloud (Keys page).
Environment: GATHER_URL, GATHER_TOKEN. Precedence: flags > env > config file.`;

function parse(argv) {
  const a = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--json') a.flags.json = true;
    else if (t === '-h' || t === '--help') a.flags.help = true;
    else if (t === '-v' || t === '--version') a.flags.version = true;
    else if (t.startsWith('--')) a.flags[t.slice(2)] = argv[++i];
    else a.flags._raw = null, a._.push(t);
  }
  return a;
}

function out(x) { console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2)); }
function fail(msg, code = 1) { console.error(msg); process.exit(code); }

function client(flags) {
  const { url, token } = resolve({ url: flags.url, token: flags.key });
  if (!token) {
    fail('no key configured. Run: hunta login --key <your-key>  (mint one at https://console.hunta.cloud)\nor set GATHER_TOKEN.', 2);
  }
  return new HuntaClient({ url, token });
}

function printFacts(res, jsonMode) {
  if (jsonMode) return out(res);
  const facts = res.results ?? res.facts ?? res.memories ?? res;
  if (!Array.isArray(facts) || facts.length === 0) return out('no sealed facts matched.');
  for (const f of facts) {
    const text = f.memory ?? f.text ?? f.content ?? JSON.stringify(f);
    const when = f.valid_from ?? f.created ?? '';
    console.log(`- ${text}${when ? `  (since ${String(when).slice(0, 10)})` : ''}`);
  }
}

function printVerify(r, source) {
  const m = r.manifest || {}; const p = m.probes || {};
  if (r.ok) {
    console.log('PASS  isolation attestation verified');
    console.log(`  signature   valid Ed25519, kid ${r.kid} (pinned from ${source})`);
    console.log(`  tenant      ${m.tenant ?? '?'}`);
    console.log(`  signed at   ${m.ts ?? '?'}   nonce ${m.nonce ?? '?'}`);
    console.log(`  conclusive  ${p.conclusive === true}   all boundaries held  ${p.all_denied === true}`);
    return 0;
  }
  console.log('FAIL  isolation attestation NOT verified');
  console.log(`  reason      ${r.reason}`);
  return 1;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const a = parse(argv.slice(1));

  if (!cmd || a.flags.help || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(HELP); process.exit(cmd ? 0 : 2);
  }
  if (a.flags.version || cmd === '--version' || cmd === '-v') { console.log(VERSION); process.exit(0); }

  try {
    switch (cmd) {
      case 'gather':
      case 'remember': {  // remember = quiet alias; the brand surface leads with gather
        const text = a._[0];
        if (!text) fail('usage: hunta gather "<text>"', 2);
        const res = await client(a.flags).gather(text, { validFrom: a.flags['valid-from'] });
        a.flags.json ? out(res) : out('gathered. It enters canon once curation seals it.');
        break;
      }
      case 'recall': {
        const query = a._[0];
        if (!query) fail('usage: hunta recall "<query>"', 2);
        const res = await client(a.flags).recall(query, {
          limit: a.flags.limit ? Number(a.flags.limit) : 10,
          asOf: a.flags['as-of'], entity: a.flags.entity,
        });
        printFacts(res, a.flags.json);
        break;
      }
      case 'instinct': {
        const res = await client(a.flags).instinct({ action: a.flags.action });
        out(res);
        break;
      }
      case 'verify': {
        const jwksUrl = (a.flags.url || DEFAULT_URL) + '/.well-known/jwks.json';
        let receipt, source;
        if (a._[0]) {
          receipt = JSON.parse(readFileSync(a._[0], 'utf8'));
          if (receipt.signed_receipt) receipt = receipt.signed_receipt; // accept the report wrapper too
        } else {
          // no file: run the live probes against your own tenant, then verify the fresh receipt
          receipt = await client(a.flags).verifyIsolation(`hunta-cli-${Date.now()}`);
          if (receipt.signed_receipt) receipt = receipt.signed_receipt;
        }
        let jwks;
        if (a.flags.jwks) { jwks = JSON.parse(readFileSync(a.flags.jwks, 'utf8')); source = a.flags.jwks; }
        else {
          const res = await fetch(jwksUrl);
          if (!res.ok) fail(`could not fetch JWKS from ${jwksUrl} (HTTP ${res.status})`);
          jwks = await res.json(); source = jwksUrl;
        }
        const r = verifyReceipt(receipt, jwks);
        if (a.flags.json) { out({ ok: r.ok, kid: r.kid, reason: r.reason, tenant: r.manifest?.tenant }); process.exit(r.ok ? 0 : 1); }
        process.exit(printVerify(r, source));
        break;
      }
      case 'login': {
        if (!a.flags.key) fail('usage: hunta login --key <your-key> [--url https://mcp.hunta.ai]', 2);
        const cfg = readConfig();
        cfg.token = a.flags.key;
        if (a.flags.url) cfg.url = a.flags.url.replace(/\/$/, '');
        const p = writeConfig(cfg);
        out(`saved to ${p}`);
        break;
      }
      default:
        fail(`unknown command "${cmd}". Run: hunta --help`, 2);
    }
  } catch (e) {
    if (e instanceof HuntaError) {
      if (e.status === 401) fail('unauthorized: your key was rejected. Re-run hunta login with a fresh key from the console.');
      if (e.status === 403) fail('forbidden: your key lacks the scope for this action (see the Keys page in the console).');
      fail(e.message);
    }
    fail(e.message ?? String(e));
  }
}

main();
