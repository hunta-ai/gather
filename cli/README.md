# hunta

The Hunta CLI. Attestable, curated memory for AI agents, from the terminal.

```bash
npm i -g hunta      # or: npx hunta ...
```

## Setup

Mint a key in the [console](https://console.hunta.cloud) (Keys page), then:

```bash
hunta login --key <your-key>
```

Or use the same environment variables as the Claude Code plugin: `GATHER_URL`, `GATHER_TOKEN`.

## The verbs

```bash
# governed write: with an agent key this lands in your staging queue, never straight to canon
hunta gather "Our design partner is Acme Corp."

# search sealed facts, with provenance; --as-of is a bi-temporal point-in-time read
hunta recall "design partner"
hunta recall "design partner" --as-of 2026-06-01

# prove your isolation: runs the live probes, verifies the signed receipt against
# Hunta's published key, prints the transcript. Exit 0 on PASS.
hunta verify

# verify a saved receipt fully offline
hunta verify receipt.json --jwks jwks.json

# the governed reflex set (standing constraints)
hunta instinct
```

The verbs read as the pipeline: **gather** takes in, curation seals, **recall** reads, **instinct** is
what your fleet never forgets, and **verify** is the proof. (`hunta remember` works as an alias of
`gather` if your fingers expect it.)

`--json` on any command gives machine-readable output.

## The SDK seed

The CLI is a thin skin over a typed client you can import directly:

```js
import { HuntaClient } from 'hunta';
const hunta = new HuntaClient({ url: 'https://mcp.hunta.ai', token: process.env.GATHER_TOKEN });
const facts = await hunta.recall('design partner');
```

## License

Apache-2.0. Part of [Hunta](https://hunta.ai). Source: [hunta-ai/gather](https://github.com/hunta-ai/gather).
