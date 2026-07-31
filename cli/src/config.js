// Credential + endpoint resolution. Precedence: explicit flags > environment > config file.
// `hunta login` writes ~/.config/hunta/config.json (0600). Env vars match the plugin and docs:
// GATHER_URL / GATHER_TOKEN.

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_URL = 'https://mcp.hunta.ai';

export function configPath() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'hunta', 'config.json');
}

export function readConfig() {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(cfg) {
  const p = configPath();
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
  chmodSync(p, 0o600); // the key is a credential
  return p;
}

/** Resolve {url, token} from flags/env/config. Token may be absent; callers decide if that's fatal. */
export function resolve(flags = {}) {
  const cfg = readConfig();
  return {
    url: (flags.url || process.env.GATHER_URL || cfg.url || DEFAULT_URL).replace(/\/$/, ''),
    token: flags.token || process.env.GATHER_TOKEN || cfg.token || '',
  };
}
