// Thin client over the TinyFish Fetch, Search and Agent APIs.
// Docs: https://docs.tinyfish.ai/fetch-api/reference.md, /search-api/reference.md, /agent-api/reference.md
const FETCH_URL = 'https://api.fetch.tinyfish.ai';
const SEARCH_URL = 'https://api.search.tinyfish.ai';
const AGENT_URL = 'https://agent.tinyfish.ai/v1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Thrown when TinyFish could not be reached or took too long (as opposed to rejecting the request).
// Callers that can carry on without the call catch this; auth and quota errors stay fatal.
export class TinyFishUnavailable extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function apiKey() {
  const key = process.env.TINYFISH_API_KEY?.trim();
  if (!key) throw new Error('TINYFISH_API_KEY is not set. Create a key at https://agent.tinyfish.ai/api-keys and put it in .env.local.');
  return key;
}

const authed = (extra = {}) => ({ 'X-API-Key': apiKey(), ...extra });

// Network blips and 429/5xx are retried with a short backoff; a timeout is not (it would only repeat the wait).
async function send(product, makeRequest, { tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await makeRequest();
      if ([429, 502, 503, 504].includes(res.status) && i < tries - 1) {
        await sleep(600 * 2 ** i);
        continue;
      }
      return res;
    } catch (e) {
      last = e;
      if (e?.name === 'TimeoutError') {
        throw new TinyFishUnavailable(`TinyFish ${product} timed out. Try again in a moment.`, 'timeout');
      }
      if (i < tries - 1) await sleep(600 * 2 ** i);
    }
  }
  const code = last?.cause?.code ?? last?.cause?.message ?? last?.message;
  throw new TinyFishUnavailable(
    `TinyFish ${product} could not be reached${code ? ` (${code})` : ''}. Try again in a moment.`,
    'unreachable',
  );
}

async function failFrom(res, product) {
  const body = (await res.text().catch(() => '')).slice(0, 240);
  const hints = {
    401: 'the API key was rejected — create a fresh one at https://agent.tinyfish.ai/api-keys',
    402: 'the free allowance is used up and the wallet is empty',
    429: 'rate limit hit — wait a moment and retry',
  };
  throw new Error(`TinyFish ${product} failed (${res.status}): ${hints[res.status] ?? body}`);
}

// Render a URL in a real browser. Resolves to { ok: true, ...result } or { ok: false, error, status }.
// ttl: 0 forces a live fetch, never a cached copy.
export async function tfFetch(url, { format = 'markdown', links = false } = {}) {
  try {
    return await tfFetchOnce(url, { format, links });
  } catch (e) {
    // A slow or unreachable fetch becomes a finding in the report; auth and quota errors still throw.
    if (e instanceof TinyFishUnavailable) return { ok: false, error: e.code };
    throw e;
  }
}

async function tfFetchOnce(url, { format, links }) {
  const res = await send('Fetch', () =>
    fetch(FETCH_URL, {
      method: 'POST',
      headers: authed({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        urls: [url],
        format,
        links,
        ttl: 0,
        per_url_timeout_ms: 40_000, // fail with a clean "timeout" result well inside a 60s serverless limit
        purpose: 'Audit how AI search and fetch tools read this page',
      }),
      signal: AbortSignal.timeout(50_000),
    }),
  );
  if (!res.ok) await failFrom(res, 'Fetch');
  const data = await res.json();
  if (data.results?.[0]) return { ok: true, ...data.results[0] };
  const err = data.errors?.[0];
  return { ok: false, error: err?.error ?? 'unknown', status: err?.status };
}

// Several URLs in one request (the API takes up to 10). Resolves to a Map keyed by the URL as sent.
// A failed URL maps to { ok: false, error, status }.
export async function tfFetchMany(urls, { format = 'html' } = {}) {
  const sent = urls.slice(0, 10);
  const res = await send('Fetch', () =>
    fetch(FETCH_URL, {
      method: 'POST',
      headers: authed({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        urls: sent,
        format,
        ttl: 0,
        per_url_timeout_ms: 20_000, // one slow rival must not hold the whole audit up
        purpose: 'Compare how readable the pages ranking for a topic are to AI tools',
      }),
      signal: AbortSignal.timeout(35_000),
    }),
  );
  if (!res.ok) await failFrom(res, 'Fetch');
  const data = await res.json();

  // The API echoes URLs, sometimes normalised (trailing slash, www). Match on a normalised key.
  const norm = (u) => String(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
  const byKey = new Map();
  for (const r of data.results ?? []) byKey.set(norm(r.url), { ok: true, ...r });
  for (const e of data.errors ?? []) byKey.set(norm(e.url), { ok: false, error: e.error, status: e.status });
  const out = new Map();
  for (const u of sent) out.set(u, byKey.get(norm(u)) ?? { ok: false, error: 'not_returned' });
  return out;
}

export async function tfSearch(query, { location = 'US', language = 'en' } = {}) {
  const u = new URL(SEARCH_URL);
  u.search = new URLSearchParams({
    query,
    location,
    language,
    purpose: 'Check whether this page is discoverable for its own topic',
  }).toString();
  const res = await send('Search', () => fetch(u, { headers: authed(), signal: AbortSignal.timeout(30_000) }));
  if (!res.ok) await failFrom(res, 'Search');
  return res.json();
}

// Agent API (asynchronous): start a run, then poll it. A real agent drives a real browser toward a
// plain-English goal. Starting returns immediately, so no serverless request waits on the agent.
export async function tfAgentStart(url, goal, { maxSeconds = 90 } = {}) {
  const post = (agentConfig) =>
    send('Agent', () =>
      fetch(`${AGENT_URL}/automation/run-async`, {
        method: 'POST',
        headers: authed({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url, goal, browser_profile: 'lite', ...(agentConfig ? { agent_config: agentConfig } : {}) }),
        signal: AbortSignal.timeout(30_000),
      }),
    );
  // Custom agent_config fields are beta-gated on some accounts (403 "not enabled"): retry bare.
  let res = await post({ max_duration_seconds: maxSeconds });
  if (res.status === 403) res = await post(null);
  if (!res.ok) await failFrom(res, 'Agent');
  const data = await res.json();
  if (!data.run_id) throw new Error(`TinyFish Agent did not start a run${data.error?.message ? `: ${data.error.message}` : ''}`);
  return data.run_id;
}

export async function tfAgentGet(runId) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(runId))) throw new Error('Invalid run id.');
  const res = await send('Agent', () =>
    fetch(`${AGENT_URL}/runs/${runId}?screenshots=none&html=none`, { headers: authed(), signal: AbortSignal.timeout(20_000) }),
  );
  if (!res.ok) await failFrom(res, 'Agent');
  const d = await res.json();
  return {
    status: d.status, // PENDING | RUNNING | COMPLETED | FAILED | CANCELLED
    steps: d.num_of_steps ?? null,
    result: d.result ?? null,
    error: d.error ?? null,
  };
}
