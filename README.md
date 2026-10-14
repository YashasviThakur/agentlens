# AgentLens

**See your page the way AI sees it, and how that connects to where it ranks.**

Paste any URL. AgentLens reads it the way a plain crawler would and the way a real browser would, checks where it ranks for its own topic, fetches the pages that outrank it and scores them the same way, then sends a TinyFish agent to the live page. You get a report a site owner can act on the same day, with the code to paste.

Built for the TinyFish × DTU bounty **“DTU: SEO Page Auditor”**.

## How TinyFish is used

| Endpoint | What it does here | Why the page can't be audited without it |
|---|---|---|
| **Search API** | Searches the page's own topic (or a query you give) to find its rank, and which pages rank above it | Visibility can't be inferred from the page's markup |
| **Fetch API** | Renders the page, **and each page that outranks it**, in a real browser. Compared with a plain HTTP request, it shows exactly what only appears after JavaScript runs | A plain GET sees an empty shell on client-rendered sites; only a browser sees what an AI fetch tool extracts |
| **Agent API** | Sends an agent to the live page to say what it understood, what the main action is, and what got in its way (consent walls, pop-ups, login walls) | A static fetch can't tell whether an agent can actually *use* the page |

## How it meets the brief

| Requirement | Where |
|---|---|
| Takes a URL and optionally a target search query | Input field and the “Target search query” option (`POST /api/audit { url, query }`) |
| Uses TinyFish Search and Fetch, both meaningfully | Search finds the rank and the rivals; Fetch renders the page and every rival (`lib/audit.js`, `lib/connect.js`) |
| Covers what AI tools can and can't read, visibility gaps, and concrete fixes | *What an AI tool sees* (raw vs rendered), *Readability ↔ visibility*, *Fix these first* |
| Audits live pages, not saved copies | Every run fetches the URL live; Fetch is called without cache reuse for the audited page's rivals and page |
| Findings are specific and actionable, not generic SEO tips | Each failing check carries a snippet filled with the page's own title, description, URL and links (JSON-LD, canonical, Open Graph, `llms.txt`, `robots.txt` lines). Client-side apps are named (React/Vite, Next.js, Nuxt, Angular, Vue) with the matching fix |
| Works for any URL | Public `http(s)` pages; private and local addresses are refused. Pages that block fetching are reported as a finding instead of failing |
| Connects readability to search visibility | The *Readability ↔ visibility* card: readability score against rank, a four-way reading (visible/hidden × readable/unreadable), a table of the pages ranking around it, and the signals they have that this page lacks |
| Demo on several real pages | [`demo/RESULTS.md`](demo/RESULTS.md) |

## What it checks

| Category | Question | Examples |
|---|---|---|
| **Access** | Can AI tools reach it? | Fetch succeeds, plain request returns 200, `robots.txt` rules for GPTBot / OAI-SearchBot / ChatGPT-User / ClaudeBot / PerplexityBot…, `llms.txt`, sitemap |
| **Rendering** | Does the content survive without JavaScript? | Share of the main text present in the served HTML vs after rendering; `<h1>` in the served HTML; content length |
| **Structure** | Can a model understand it? | `<title>`, meta description, single `<h1>`, heading order, JSON-LD, canonical, `lang`, Open Graph, alt text, `<main>` |
| **Discovery** | Does search surface it? | Rank for its own topic, internal link graph |

*AI readability* is the Rendering and Structure scores combined. The page and each rival are scored with the same checks, so the comparison is like for like.

TinyFish's HTML output is cleaned main content with no `<head>`, so head signals (canonical, Open Graph, JSON-LD) are read from the HTML as served to crawlers. That is the right thing to measure for crawlers that don't run JavaScript. TinyFish's own title, description and language fields are used to tell “absent” from “set only by JavaScript”.

## Run it

```bash
npm install
cp .env.example .env.local   # then set TINYFISH_API_KEY
npm run dev                  # http://localhost:4410
```

```bash
npm run smoke -- https://react.dev --agent --snippets   # the same pipeline, in the terminal
npm run demo                                            # regenerate demo/RESULTS.md
```

| Variable | Required | Purpose |
|---|---|---|
| `TINYFISH_API_KEY` | yes | Search, Fetch and Agent. Create one at <https://agent.tinyfish.ai/api-keys> |
| `GROQ_API_KEY` | no | LLM-written verdict that ties readability to rank. Without it the verdict is rule-based |
| `GROQ_MODEL` | no | Defaults to `llama-3.3-70b-versatile` |

If a `TINYFISH_API_KEY` is already set in your shell it takes precedence over `.env.local`.

## Notes and limits

- The Agent API is called through `/v1/automation/run` with a read-only goal (no logins, no form submission). Custom `max_steps` is beta-gated on some accounts, so only a duration cap is requested, with a bare fallback.
- The agent test runs after the report appears, because it takes about 40 seconds. It reports findings but does not change the score.
- Rival pages are fetched in one batched Fetch request; ones that block TinyFish are reported as such, which is itself a finding.
- Plain requests use a small SSRF guard: only `http(s)`, private and local addresses refused, redirects re-checked at every hop.

## Layout

```
app/api/audit/route.js        POST { url, query? } → report
app/api/agent-check/route.js  POST { url, title?, h1?, description? } → agent test
lib/audit.js                  orchestration
lib/checks.js                 every check, scoring
lib/connect.js                rival profiling + readability ↔ visibility
lib/facts.js                  page facts, paste-ready snippets, framework detection
lib/agent.js                  Agent API test
lib/tinyfish.js               Search / Fetch / Agent client
lib/safeFetch.js              plain GET with private-address guard
lib/robots.js                 robots.txt parser for AI crawlers
lib/llm.js                    optional verdict + rule-based fallback
scripts/                      smoke.mjs, demo.mjs
```
