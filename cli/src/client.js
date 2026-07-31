// The typed Hunta HTTP client. This file is the @hunta/sdk seed: the CLI is a thin skin over it,
// and it has no CLI dependencies, so it can be imported directly (`import { HuntaClient } from 'hunta'`).

/**
 * @typedef {Object} HuntaClientOptions
 * @property {string} url    base URL, e.g. https://mcp.hunta.ai
 * @property {string} token  bearer key (the tenant is bound to it server-side)
 */

export class HuntaError extends Error {
  constructor(status, body, path) {
    super(`hunta api ${path} -> ${status}${body ? `: ${body}` : ''}`);
    this.status = status;
    this.body = body;
  }
}

export class HuntaClient {
  /** @param {HuntaClientOptions} opts */
  constructor({ url, token }) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
  }

  async #call(method, path, body) {
    const res = await fetch(this.url + path, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new HuntaError(res.status, text.slice(0, 300), path);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** Governed write. With a capture-scoped key this lands as a staging candidate, never straight to canon. */
  gather(text, { validFrom, agent } = {}) {
    const body = { text };
    if (validFrom) body.valid_from = validFrom;
    if (agent) body.agent = agent;
    return this.#call('POST', '/v1/memories', body);
  }

  /** Search sealed facts (with provenance). asOf = bi-temporal point-in-time read. */
  recall(query, { limit = 10, asOf, entity, agent } = {}) {
    const body = { query, limit };
    if (asOf) body.as_of = asOf;
    if (entity) body.entity = entity;
    if (agent) body.agent = agent;
    return this.#call('POST', '/v1/memories/search', body);
  }

  /** The governed reflex set. With `action`, the deterministic per-action gate query. */
  instinct({ action } = {}) {
    const q = action ? `?action=${encodeURIComponent(action)}` : '';
    return this.#call('GET', `/v1/errata${q}`);
  }

  /** Run the live isolation probes; returns the Ed25519-signed receipt. */
  verifyIsolation(nonce) {
    const q = nonce ? `?nonce=${encodeURIComponent(nonce)}` : '';
    return this.#call('POST', `/v1/admin/verify-isolation${q}`);
  }
}
