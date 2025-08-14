KuttyAI v0.2.0 — Electron viewer + child-safe tools (documentation summary; code not printed here).


### Image tool isolation
- The **Image Gallery** now defaults to **dataURI** mode for full network isolation.
- The **Electron viewer** receives **policy** (allowlists, banned terms) from the KuttyAI process via **IPC** and enforces it before any content is shown.
- The viewer is subordinate to the orchestrator: no load until policy handshake completes; navigation is blocked; non-allowlisted requests are denied at the main-process level.


## Profiles
- **hardened (default):** fail-closed if `--domains` is empty, default image mode **dataURI**, strict CSP, navigation blocked, devtools off.
- **dev:** easier local debugging; allows URL mode images and devtools.

Use with CLI, e.g.:
```
kuttyai gallery --profile hardened --input "friendly cats for kids" --banned ./examples/banned.json --domains ./examples/domains.json --electron
```

## Dev flow (pnpm)
```
pnpm i
pnpm test
pnpm dev
```
