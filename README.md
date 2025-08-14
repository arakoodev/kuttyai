

## Configuration (.env)
Create a `.env` file at the project root (or export env vars) using the template in `.env.example`:

- `OPENAI_API_KEY` — required for live LLM calls (PerplexSearch, captions, moderation).
- `GOOGLE_CSE_ID` + `GOOGLE_API_KEY` — for allowlisted web & image search.
- `YOUTUBE_API_KEY` — for YouTube search and comments sampling.
- `KUTTYAI_MODEL` — optional model override.

The CLI and viewer will auto-load `.env` on startup.


### Running via npx (local dev)
Because this package isn’t published yet, use npx against the local folder:
```
npx --yes . perplexsearch --input "Why does it rain? Explain simply." --domains ./examples/domains.json --banned ./examples/banned.json
```
(or)
```
node bin/kuttyai.js perplexsearch --input "Why does it rain? Explain simply." --domains ./examples/domains.json --banned ./examples/banned.json
```
After publishing to npm, `npx kuttyai ...` will work globally.

