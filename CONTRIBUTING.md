# Contributing

Thanks for your interest in improving the Gather integrations.

## Ways to help
- **Bug reports and feature requests:** open an issue (templates provided).
- **New integrations:** the pattern (recall on prompt, re-inject after compaction, capture on end)
  generalises across harnesses. A new integration lives under `integrations/<harness>/`.
- **Docs and examples:** fixes to `docs/` and `examples/` are very welcome.

## Ground rules
- Keep changes surgical and matched to the surrounding style.
- Hooks and scripts must stay **fail-open**: any error path exits 0 without blocking a turn.
- No secrets in the tree. All configuration is via environment variables; never hardcode a token
  or an internal host.
- Run the checks locally: `shellcheck integrations/**/scripts/*.sh` and validate JSON manifests
  (the CI does both).

## Licensing
By contributing you agree that your contributions are licensed under the
[Apache License, Version 2.0](./LICENSE).
