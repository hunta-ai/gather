import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HuntaClient } from '../src/client.js';

const pExecFile = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, '..', 'src', 'index.js');
const FIX = join(here, '..', '..', 'verify', 'fixtures');

// ---- mock backend --------------------------------------------------------------------------------
// NOTE: the CLI is exercised via ASYNC execFile. execFileSync would block this process's event loop,
// and the mock server lives in this process, so the child's request could never be answered.
let server, base;
const seen = [];
before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      if (!req.headers.authorization?.startsWith('Bearer ')) {
        res.writeHead(401).end('{}');
        return;
      }
      res.setHeader('content-type', 'application/json');
      if (req.url === '/v1/memories' && req.method === 'POST') {
        res.end(JSON.stringify({ id: 'm1', status: 'candidate' }));
      } else if (req.url === '/v1/memories/search') {
        res.end(JSON.stringify({ results: [{ memory: 'Our design partner is Acme Corp.', valid_from: '2026-03-01' }] }));
      } else if (req.url.startsWith('/v1/errata')) {
        res.end(JSON.stringify({ actions: [], count: 0, url: req.url }));
      } else {
        res.writeHead(404).end('{}');
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const run = (args, env = {}) =>
  pExecFile(process.execPath, [CLI, ...args], {
    env: { ...process.env, GATHER_URL: base, GATHER_TOKEN: 'test-key', XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'hunta-')), ...env },
    encoding: 'utf8',
  }).then((r) => r.stdout);

// ---- client (the SDK seed) -----------------------------------------------------------------------
test('client.gather posts to /v1/memories with the bearer key', async () => {
  const c = new HuntaClient({ url: base, token: 'k' });
  const r = await c.gather('hello', { validFrom: '2026-01-01' });
  assert.equal(r.id, 'm1');
  const last = seen.at(-1);
  assert.equal(last.url, '/v1/memories');
  assert.equal(last.auth, 'Bearer k');
  assert.match(last.body, /valid_from/);
});

test('client.recall carries as_of and entity', async () => {
  const c = new HuntaClient({ url: base, token: 'k' });
  await c.recall('acme', { asOf: '2026-06-01', entity: 'Acme' });
  assert.match(seen.at(-1).body, /as_of/);
  assert.match(seen.at(-1).body, /entity/);
});

// ---- CLI verbs -----------------------------------------------------------------------------------
test('hunta gather writes and reports the curation gate', async () => {
  const outp = await run(['gather', 'test fact']);
  assert.match(outp, /gathered/i);
});

test('hunta remember is an alias of gather', async () => {
  const outp = await run(['remember', 'aliased fact']);
  assert.match(outp, /gathered/i);
  assert.equal(seen.at(-1).url, '/v1/memories');
});

test('hunta recall prints sealed facts', async () => {
  const outp = await run(['recall', 'acme']);
  assert.match(outp, /Acme Corp/);
  assert.match(outp, /since 2026-03-01/);
});

test('hunta instinct hits /v1/errata with --action', async () => {
  const outp = await run(['instinct', '--action', 'deploy']);
  assert.match(outp, /action=deploy/);
});

test('hunta verify <receipt> --jwks verifies offline (real fixture)', async () => {
  const outp = await run(['verify', join(FIX, 'receipt.json'), '--jwks', join(FIX, 'jwks.json')]);
  assert.match(outp, /PASS {2}isolation attestation verified/);
  assert.match(outp, /hunta-attest-1/);
});

test('hunta verify fails closed on a tampered receipt', async () => {
  const tampered = JSON.parse(readFileSync(join(FIX, 'receipt.json'), 'utf8'));
  tampered.manifest.tenant = 'attacker';
  const dir = mkdtempSync(join(tmpdir(), 'hunta-'));
  const f = join(dir, 'bad.json');
  writeFileSync(f, JSON.stringify(tampered));
  await assert.rejects(run(['verify', f, '--jwks', join(FIX, 'jwks.json')]), (e) => e.code === 1);
});

test('missing key fails with guidance, not a stack trace', async () => {
  await assert.rejects(
    run(['recall', 'x'], { GATHER_TOKEN: '' }),
    (e) => /hunta login/.test(e.stderr ?? ''),
  );
});

test('login stores the key and recall uses it', async () => {
  const xdg = mkdtempSync(join(tmpdir(), 'hunta-'));
  const env = { GATHER_TOKEN: '', XDG_CONFIG_HOME: xdg };
  await run(['login', '--key', 'stored-key', '--url', base], env);
  const outp = await run(['recall', 'acme'], env);
  assert.match(outp, /Acme Corp/);
  assert.equal(seen.at(-1).auth, 'Bearer stored-key');
});
