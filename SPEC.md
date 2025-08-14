# KuttyAI — Implementation Specification & README (for AI Codegen)

> **Goal:** Build a kid-safe, batteries-included npm package (“kuttyai”) that ships a **safety-first orchestrator** for LLM tool-use and a **child-friendly search experience** (Perplexity-like “perplexsearch”), **YouTube** playback with multilayer safety checks, and **image galleries** that default to **data: URIs** — all guarded by strict allowlists/banned-term policies and a hardened **Electron** viewer.
> **Usage:** runnable via `npx`/global CLI, **fail-closed** by default unless a domain allowlist is supplied.

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Design Goals & Non-Goals](#design-goals--non-goals)
3. [Threat Model & Safety Guarantees](#threat-model--safety-guarantees)
4. [High-Level Architecture](#high-level-architecture)
5. [Prompt Hierarchy](#prompt-hierarchy)
6. [Tooling: Capabilities & Contracts](#tooling-capabilities--contracts)
7. [Orchestrator Loop & Tool Specs](#orchestrator-loop--tool-specs)
8. [Electron Viewer (Hardened)](#electron-viewer-hardened)
9. [Policies: Fail-Closed, Allowlists, Banned Terms](#policies-fail-closed-allowlists-banned-terms)
10. [Configuration & Keys](#configuration--keys)
11. [CLI & Intended Usage (README)](#cli--intended-usage-readme)
12. [Testing & CI](#testing--ci)
13. [Telemetry, Privacy, and Data Handling](#telemetry-privacy-and-data-handling)
14. [Accessibility & UX](#accessibility--ux)
15. [Extensibility & Future Work](#extensibility--future-work)
16. [References](#references)
17. [Retrospective & Lessons Learned](#retrospective--lessons-learned)

---

## Product Overview

**KuttyAI** is a Node.js/TypeScript library + CLI that:

* Loads a **global safety system prompt** and **session-specific sub-prompts** (e.g., for Perplexity-style search or YouTube) from local files or GitHub URLs.
* Converts a **tools JSON/XML** into **OpenAI-compatible tool specs** and runs an **orchestrator loop**:

  * The LLM proposes tool calls.
  * The orchestrator **executes tools locally** (web search, allowlisted filters, YouTube vetting, gallery generator, file ops).
  * The tool outputs are **fed back** to the model until completion.
* Enforces **child safety** via a **stack**: domain allowlists (fail-closed), banned-term scanning, safe search providers, LLM safety judgements (“comments sampling pass”), and a **hardened Electron viewer/webview** with no address bar and strict navigation rules.
* Ships a **Perplexity-like “perplexsearch”**: rich multi-source search + concise, age-appropriate synthesis with inline cite numbers and a source list (only from allowed domains).
* Ships **YouTube**: finds candidate videos **on allowlisted domains**, runs **multi-layer safety review** (keywords + LLM + comment sample), and then **opens a safe embed** in Electron (unless suppressed).
* Ships **Images**: “kid-safe gallery” builder that **defaults to data: URIs** for complete isolation; the Electron viewer enforces the same allowlist policy.

---

## Design Goals & Non-Goals

### Goals

* **Safety over reach:** The system **fails closed** unless given explicit **allowlists**.
* **One-shot setup:** Users can `npx kuttyai` with **no custom host app**.
* **Baked-in orchestrator:** Tool calls are **executed locally**; no hand-waving “tool calls” that go nowhere.
* **Deterministic tests:** Mock mode to validate functionality without network or API quotas.
* **Hardened rendering:** Electron viewer/webview with strict policies and zero chrome.
* **Prompt hygiene:** Clear hierarchy (global system > session sub-prompt) with **comments sampling pass** for UGC (e.g., YouTube comments).

### Non-Goals

* Not a general coding assistant; this library is **for children’s content safety** and guided exploration.
* Not a full parental control suite (DNS filtering, OS-level blocking) — **in-app and workflow safety only**.
* Not a data collector — **no telemetry** by default.

---

## Threat Model & Safety Guarantees

**Threats considered:**

* LLM hallucination of unsafe links.
* Tool execution returning unsafe resources.
* Navigation from a safe page to an unsafe origin (e.g., YouTube to comments?).
* YouTube videos that are benign on title/desc but problematic in comments/content.
* Image hotlinks that leak referrers or load tracking content.

**Guarantees:**

* **Fail-closed**: If no `--domains` allowlist is provided, tools refuse to run.
* **Domain-scoped**: Every URL is vetted against the allowlist (exact match or subdomain).
* **Banned terms**: Basic string scanning across titles, snippets, and sampled comments.
* **LLM “comments sampling pass”**: The LLM labels **allow / block / review** for videos; “block” prevents playback.
* **Render hardening**: data: URIs for images by default; Electron denies window\.open/navigation to non-allowed origins.

---

## High-Level Architecture

* **CLI** (`bin/`): Entry point that loads `.env`, parses flags, loads prompts/policies, and runs commands (perplexsearch, youtube, gallery).
* **Orchestrator** (`src/`):

  * **Prompt loader**: from file or URL (agents.md, prompt.xml).
  * **Tools spec**: convert JSON/XML into OpenAI tool schema.
  * **Loop**: `messages[]` + `tools[]` with local execution and LLM responses.
* **Toolkit** (`src/toolkit/`):

  * `safeSearch` (Google CSE web/images with `safe=active`, allowlist filter).
  * `perplexSearch` (wrapper + synthesis step).
  * `safeYouTubeSearch` (YouTube Data API search).
  * `reviewYouTubeSafety` (banned terms + LLM review + comments sample).
  * `safeImageGallery` (returns `galleryHtml`, defaults to `data:`).
  * `openSafeUrl` (YouTube embeds, allowlist enforced).
* **Viewer** (`viewer/`): Electron main process + invocation helpers; policy enforced via session/webRequest and sandboxed iframe.

---

## Prompt Hierarchy

### 1) **Global System Prompt** (applies to **every** session)

* Audience: **kids (7–12)**.
* Tone: simple, gentle, encouraging.
* **Safety rules (hard):**

  * Never suggest unsafe activities; avoid graphic detail.
  * Never output non-allowlisted links; prefer whitelisted educational domains.
  * Always **cite** sources numerically \[1], \[2]… and list them at the end.
  * If something is borderline, **ASK\_ALTERNATIVE** (offer safer topics).
  * Respect **banned terms**; if present, block with a kind note.
  * **Privacy**: don’t request personal info beyond first name (and only for personalization if parent has consent).

> Keep this file local or at a Git URL (e.g., `/prompts/global-system.md`). The orchestrator **must** load it first.

### 2) **Session Sub-Prompts**

* **PerplexSearch sub-prompt:**

  * Instruction to **aggregate multiple allowlisted sources**, summarize simply (4–6 short sentences), avoid scary details, apply cite markers `[n]`, and prefer interactive kid activities (“draw a picture of the water cycle…”) when appropriate.
* **YouTube sub-prompt (review):**

  * Instruction to **label** candidate video as `allow | block | review` with **1–3 short reasons**; block for any of: violence, sexual content, drugs/alcohol, self-harm, hate, weapons, disturbing imagery; be conservative.
  * Prompt consumes: title, description, 3–10 sampled comments (HTML stripped), and known channel metadata if available.
* **Images sub-prompt (optional captions):**

  * Generate a **single safe caption** per image link (max 12), avoid faces/identifying info, encourage learning.

---

## Tooling: Capabilities & Contracts

> All tools receive a `ctx` with `{ policy, openai, model, keys, prompts }`.

### `safeSearch({ query, topK }) -> { safe, results[] }`

* Uses Google CSE (web) with `safe=active`.
* Filters results to **allowlisted domains** (exact or subdomain).
* Returns: `[{ title, link, displayLink, host, snippet }]`.

### `perplexSearch({ query, topK }) -> { safe, results[] }`

* Thin wrapper around `safeSearch` for readability.

### `safeYouTubeSearch({ query }) -> { safe, video }`

* Uses YouTube Data API v3 (`search`) to find the top educational video.
* **Does not** finalize playback — must pass `reviewYouTubeSafety` first.
* Returns: `{ videoId, url, title }`.

### `reviewYouTubeSafety(video, ctx) -> { safe, decision, reasons[], sample, llm }`

* **Banned-term scan** of title/desc/comments.
* **LLM “comments sampling pass”** (returns `{label, notes}`).
* Decision rule: **block** if banned terms or LLM label != `allow`.

### `safeImageGallery({ query, max, mode='dataURI' }) -> { safe, images[], galleryHtml }`

* Google CSE (images) with `safe=active`, filtered to allowlist.
* **Default:** build `galleryHtml` with **data: URIs** (no network at render).
* `images[]`: `{ index, domain, title, url|src }`.

### `openSafeUrl({ url }) -> { safe, embedHtml?, videoId? }`

* For YouTube links only: resolve to safe embed HTML.
* Enforces domain allowlist and sandbox attributes.

---

## Orchestrator Loop & Tool Specs

1. **Load prompts** (global + session) and **tools JSON/XML**.
2. **Convert** tools to OpenAI “tool/function” schema.
3. Initialize `messages = [{role:'system', content: globalPrompt}, …]`.
4. **LLM step** → receives messages + tool schemas.
5. If LLM **calls a tool**:

   * Orchestrator **executes locally**, yielding `tool_output`.
   * Append `{role:'tool', name, content: tool_output}` to `messages`.
   * Loop back to step 4 until completion or `maxTurns`.
6. **Stop** when LLM emits final assistant content.

**Implementation notes**

* **Safety injection:** Prepend a **policy system message** summarizing allowlist/banned terms to every session.
* **Token discipline:** The orchestrator should **truncate** long tool outputs (e.g., comments) to configured token limits before returning to LLM.
* **Determinism:** Support `KUTTYAI_TEST_MOCK=1` to bypass network and return fixed outputs (NatGeo Kids / NASA / YouTube test IDs) for tests.

---

## Electron Viewer (Hardened)

* **Window:** frameless, no menu, fixed size unless configured.
* **WebPreferences:** `sandbox: true`, `contextIsolation: true`, `webSecurity: true`, `nodeIntegration: false`.
* **Navigation:** `setWindowOpenHandler(() => deny)`; `will-navigate` prevented.
* **Network gate:** `session.webRequest.onBeforeRequest` denies any URL not:

  * `file://`, `data:`, or
  * matching **allowlisted domains**.
* **YouTube embed:** `<iframe sandbox="allow-scripts allow-same-origin">` with `modestbranding=1` and `rel=0`.
* **Images:** HTML uses **data: URIs** by default (no external loads).
* **READY handshake:** Write a temp “READY” marker after `did-finish-load` (tests read it to validate startup); retain a short timeout fallback to reduce flakiness in headless CI.

---

## Policies: Fail-Closed, Allowlists, Banned Terms

* **Fail-closed** is global default unless `--domains` is provided.
* **Allowlist matching:** normalize to lowercase; `host === d` or `host.endsWith('.'+d)`.
* **Banned terms:** case-insensitive substring checks across titles, snippets, captions, and sampled comments **before** LLM review.
* **Response strategy:** when blocked, tools return `{ safe:false, reason, action:'ASK_ALTERNATIVE' }` and the assistant offers safer, nearby topics.

**JSON formats**

`domains.json`

```json
{
  "domains": ["kids.nationalgeographic.com", "www.nasa.gov", "images.nasa.gov", "youtube.com", "www.youtube.com", "youtu.be"]
}
```

`banned.json`

```json
{
  "banned": ["violence","blood","kill","sex","porn","nude","drug","alcohol","hate","suicide","self-harm","gambling","weapon","gun","extremism"]
}
```

---

## Configuration & Keys

Create `.env` (template `.env.example`):

```
OPENAI_API_KEY=sk-...
GOOGLE_CSE_ID=...
GOOGLE_API_KEY=...
YOUTUBE_API_KEY=...
KUTTYAI_MODEL=gpt-4.1-mini   # or later family tuned for safety and cost
```

* **Mock mode:** `KUTTYAI_TEST_MOCK=1` (no network; deterministic outputs).
* **Engines:** Node ≥ 18.18 (handle Node 22 shebang quirks via **CJS shim** that imports ESM CLI).

---

## CLI & Intended Usage (README)

### Install (local dev)

```bash
pnpm i
pnpm link --global
```

### Fast start (mock mode; no keys needed)

```bash
KUTTYAI_TEST_MOCK=1 kuttyai perplexsearch \
  --input "Why does it rain? Explain simply." \
  --domains ./examples/domains.json \
  --banned  ./examples/banned.json
```

**Output:** 4–6 simple sentences + `Sources:` list (only allowlisted URLs).

### YouTube (safety-reviewed; Electron viewer by default locally)

```bash
KUTTYAI_TEST_MOCK=1 kuttyai youtube \
  --input "water cycle song for kids" \
  --domains ./examples/domains.json \
  --banned  ./examples/banned.json
```

* Prints `Video:` + URL.
* Runs **banned terms + LLM review** before playback.
* Opens **Electron** viewer unless `--no-view` or `CI=1`.
* Live mode requires `.env` with `OPENAI_API_KEY` and `YOUTUBE_API_KEY`.

### Images (data URIs by default)

```bash
KUTTYAI_TEST_MOCK=1 kuttyai gallery \
  --input "rainbow drawings for kids" \
  --domains ./examples/domains.json \
  --banned  ./examples/banned.json
```

* Prints **Gallery images** list (allowlisted hosts).
* The Electron image viewer, when launched, renders **data: URI** content with the same allowlist.

### Flags (common)

* `--input "<query or question>"`
* `--domains ./domains.json` (**required**; fail-closed otherwise)
* `--banned ./banned.json` (recommended)
* `--topK <n>` (for perplexsearch; default 6)
* `--view` (force open Electron)
* `--no-view` (suppress Electron even when local)
* `--env <path>` *(optional future flag, if implemented)*

---

## Testing & CI

### Principles

* **Mock mode** provides **non-zero outputs with real, child-safe URLs** — keeps CI deterministic without API keys.
* **Electron e2e**: headless **Xvfb** on CI; READY marker after load; fallback write to avoid flake.

### Test Plan

1. **Policy / Fail-Closed**

   * No `--domains` → tools refuse; negative assertions.
2. **OpenSafeUrl**

   * youtu.be and youtube.com/watch allowed iff allowlisted; embed html returned; non-allowlisted → reject.
3. **Gallery (default dataURI)**

   * Mock returns `galleryHtml` containing `src="data:`; ensure allowlisted host list present.
4. **PerplexSearch (mock)**

   * CLI prints an answer and `Sources:` including NatGeo Kids/NASA.
5. **YouTube (mock)**

   * CLI prints `Video:` with `www.youtube.com/watch?v=...`; safety review returns allow.
6. **Viewer e2e**

   * Spawns Electron and signals READY; in CI, use Xvfb; test resolves true.

### GitHub Actions

* `ubuntu-latest`, Node 20, `pnpm i`.
* Install `xvfb`, run `pnpm test` (the tests auto-spawn Xvfb if no DISPLAY).
* Cache pnpm.

---

## Telemetry, Privacy, and Data Handling

* **No telemetry** by default.
* **PII avoidance:** Prompts and tools avoid collecting personally identifying info.
* **Deletion:** Temporary files (HTML view, READY markers) written to OS temp and removed best-effort.
* **Keys:** Loaded from `.env` only; never logged.

---

## Accessibility & UX

* **Plain language**; short sentences; define jargon.
* **High contrast** viewer theming; large hit-targets; no motion by default.
* **Captioning**: optional image captions; YouTube relies on platform CC settings.

---

## Extensibility & Future Work

* Add **reader panel** for PerplexSearch (Electron) with source cards & pagination.
* Add **strict mode** env (`KUTTYAI_E2E_STRICT=1`) to fail if Electron viewer doesn’t actually render.
* Add **domain tags** and **trust badges** in printed output.
* Optional **rate limiting** per command for shared environments.
* **Internationalization**: localized prompts and reading levels.
* **Parental PIN** gating for settings.

---

## References

* **OpenAI Tool Calling (Functions)** — *official docs*
* **Google Programmable Search (CSE)** — Search API & parameters (`safe=active`, `searchType=image`).
* **YouTube Data API v3** — `search`, `videos`, `commentThreads`.
* **Electron Security** — `sandbox`, `contextIsolation`, `webSecurity`, navigation controls.
* **Content Security Policy (CSP)** — general guidance for sandboxed iframes.

*(Note: resolve official URLs in code/README; this spec avoids hardcoding links.)*

---

## Retrospective & Lessons Learned

**What went wrong**

1. **Printed no output** initially for CLI commands — the path executed but did not print results.
2. **Overwrote toolkit exports** with placeholders — broke tests (`safeSearch is not a function`).
3. **Electron e2e flakiness** — READY marker timing and lack of headless defaults caused failures.
4. **npx / shebang issues** on Node 22 — ESM entry with shebang produced “unexpected token” and sh/shim confusion.
5. **Global link friction** — missing `bin` mapping and executable bit at first.
6. **Ambiguity about `.env` and keys** — unclear where keys must be placed.
7. **Safety pass not truly layered** for YouTube — only allowlist checks at first, no LLM or comment sampling.
8. **Fail-closed not enforced everywhere** — some tools skipped the allowlist guard early on.

**What we changed**

* **Deterministic test mode** (`KUTTYAI_TEST_MOCK=1`) producing real, safe URLs with no network/keys.
* **Toolkit restored** with full exports; all tools enforce **fail-closed** first.
* **CLI prints** concrete outputs; **PerplexSearch** provides sources; **YouTube** prints selection and runs **LLM safety review** before playback.
* **Electron viewer hardened** and **READY handshake** stabilized (event + timeout fallback; auto-Xvfb in CI).
* **Bin shim**: **CommonJS executable** that dynamically imports ESM CLI — robust across Node versions.
* **README + .env.example** spelled out required keys and usage.
* **Default viewer behavior**: launch Electron locally (unless `--no-view` or CI).

**Principles to carry forward**

* **Ship working surfaces first** (visible outputs), then add depth (safety layers).
* **Never stub core exports** when tests depend on them; add behind feature flags.
* **Prefer fail-closed** defaults and explicit enablement.
* **Always pair ESM CLIs with a CJS shim** for broad Node compatibility.
* **Make CI self-sufficient** — tests set up their own headless display, no manual `xvfb-run` instructions.

---
