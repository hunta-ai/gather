# @hunta/verify

Offline verification of Hunta isolation-attestation receipts. **Verify, don't trust.**

Hunta gives every memory store a signed proof that its tenant boundary holds: a manifest describing the
isolation mechanism plus the results of live adversarial probes (cross-schema privilege denial,
cross-tenant decrypt failure, RLS enforcement, per-tenant HMAC key separation), signed Ed25519 and
published at `https://mcp.hunta.ai/.well-known/jwks.json`. This package lets you check that proof
yourself, offline, with nothing to trust but published cryptography.

## Use it

```bash
npx @hunta/verify ./receipt.json                    # pin the key from the live published JWKS
npx @hunta/verify ./receipt.json --jwks ./jwks.json # fully offline, pin from a saved JWKS
npx @hunta/verify ./receipt.json --json             # machine-readable
```

Get a receipt from your console (Provenance) or the API:
`POST https://mcp.hunta.ai/v1/admin/verify-isolation` with your bearer token.

```
PASS  isolation attestation verified
  signature   valid Ed25519, kid hunta-attest-1 (pinned from https://mcp.hunta.ai/.well-known/jwks.json)
  tenant      acme-robotics
  build       0.4.7   probe set p4-2
  conclusive  true   all boundaries held  true
    physical (GRANT)   "54/54"
    logical (RLS)      true
    crypto (per-col)   "23/23"
    dedup-hmac         "17/17"
```

Exit `0` on PASS, `1` on FAIL or error.

## How trust works here

- The signature is checked against a key **pinned from Hunta's published JWKS**, resolved by the
  receipt's `attest_kid`.
- The `public_jwk` embedded in the receipt is **never trusted** for verification (a forger controls it);
  it is a discovery hint only.
- Canonicalization is byte-for-byte identical to the backend signer (sorted keys, compact separators,
  `ensure_ascii` escaping), so the bytes that were signed are the bytes verified.
- **Zero runtime dependencies.** The whole verifier is three small files in `src/`, using only Node's
  built-in `crypto`. Read it, audit it, run it in your own CI.

## API

```js
import { verifyReceipt } from '@hunta/verify';
const { ok, kid, reason, manifest } = verifyReceipt(receipt, jwks);
```

The proof is reproducible, not just signed: `manifest.mechanism` and `manifest.probes` describe exactly
what was tested, so you can re-run the same probes against your own tenants.

## License

Apache-2.0. Part of [Hunta](https://hunta.ai).
