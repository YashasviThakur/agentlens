// Thin client over the TinyFish Fetch and Search APIs.
// Docs: https://docs.tinyfish.ai/fetch-api/reference.md and /search-api/reference.md
const FETCH_URL = 'https://api.fetch.tinyfish.ai';
const SEARCH_URL = 'https://api.search.tinyfish.ai';

function apiKey() {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) throw new Error('TINYFISH_API_KEY is not set. Create a key at https://agent.tinyfish.ai/api-keys and put it in .env.local.');
  return key;
}

async function failFrom(res, product) {
  const body = (await res.text().catch(() => '')).slice(0, 200);
  const hints = {
    401: 'the API key was rejected — create a fresh one at https://agent.tinyfish.ai/api-keys',
    402: 'the free allowance is used up and the wallet is empty',
    429: 'rate limit hit — wait a moment and retry',
  };
  throw new Error(`TinyFish ${product} failed (${res.status}): ${hints[res.status] ?? body}`);
}

// Render a URL in a real browser. Resolves to { ok: true, ...result } or { ok: false, error, status }.
export async function tfFetch(url, { format = 'markdown', links = false } = {}) {
  const res = await fetch(FETCH_URL, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: [url],
      format,
      links,
      ttl: 0, // always a live fetch, never a cached copy
      purpose: 'Audit how AI search and fetch tools read this page',
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) await failFrom(res, 'Fetch');
  const data = await res.json();
  if (data.results?.[0]) return { ok: true, ...data.results[0] };
  const err = data.errors?.[0];
  return { ok: false, error: err?.error ?? 'unknown', status: err?.status };
}

// Several URLs in one request (the API takes up to 10). Resolves to a Map of url -> result,
// where a failed URL maps to { ok: false, error }.
export async function tfFetchMany(urls, { format = 'html' } = {}) {
  const res = await fetch(FETCH_URL, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urls: urls.slice(0, 10),
      format,
      ttl: 0,
      purpose: 'Compare how readable the pages ranking for a topic are to AI tools',
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) await failFrom(res, 'Fetch');
  const data = await res.json();
  const out = new Map();
  for (const r of data.results ?? []) out.set(r.url, { ok: true, ...r });
  for (const e of data.errors ?? []) out.set(e.url, { ok: false, error: e.error, status: e.status });
  return out;
}

// Agent API: a TinyFish agent drives a real browser toward a plain-English goal.
// Uses the synchronous /run endpoint, so keep goals short and bounded.
export async function tfAgent(url, goal, { maxSeconds = 40 } = {}) {
  const post = (agentConfig) =>
    fetch('https://agent.tinyfish.ai/v1/automation/run', {
      method: 'POST',
      headers: { 'X-API-Key': apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, goal, browser_profile: 'lite', ...(agentConfig ? { agent_config: agentConfig } : {}) }),
      signal: AbortSignal.timeout((maxSeconds + 15) * 1000), // stays under a 60s serverless limit
    });
  // Custom agent_config fields are beta-gated on some accounts (403 "not enabled"): retry bare.
  let res = await post({ max_duration_seconds: maxSeconds });
  if (res.status === 403) res = await post(null);
  if (!res.ok) await failFrom(res, 'Agent');
  const data = await res.json();
  return {
    ok: data.status === 'COMPLETED',
    status: data.status,
    steps: data.num_of_steps ?? null,
    result: data.result ?? null,
    error: data.error ?? null,
  };
}

export async function tfSearch(query, { location = 'US', language = 'en' } = {}) {
  const u = new URL(SEARCH_URL);
  u.search = new URLSearchParams({
    query,
    location,
    language,
    purpose: 'Check whether this page is discoverable for its own topic',
  }).toString();
  const res = await fetch(u, {
    headers: { 'X-API-Key': apiKey() },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) await failFrom(res, 'Search');
  return res.json();
}
