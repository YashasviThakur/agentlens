import { tfFetch, tfSearch } from './tinyfish.js';
import { assertPublicUrl, rawGet } from './safeFetch.js';
import { AI_BOTS, robotsAllows } from './robots.js';
import { CATEGORIES, gradeFor, runChecks, scoreChecks } from './checks.js';
import { buildFacts } from './facts.js';
import { connect, pickRivals, profileRivals, readabilityOf, signalsOf } from './connect.js';
import { fallbackVerdict, writeVerdict } from './llm.js';
import { clip, countWords, firstH1, looksLikeHtml, mainText } from './text.js';
import { UserError } from './errors.js';

export { UserError };

export function normalizeUrl(input) {
  let s = String(input ?? '').trim();
  if (!s) throw new UserError('Enter a URL to audit.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}

// Resolve to { v } or { e } so one failing side request never sinks the audit.
const attempt = (p) => p.then((v) => ({ v }), (e) => ({ e }));

const bareHost = (h) => h.replace(/^www\./, '');
const barePath = (p) => (p || '/').replace(/\/+$/, '') || '/';

function deriveQuery(title, target) {
  const first = String(title ?? '').split(/\s[|–—-]\s/)[0].trim();
  if (first.length >= 8) return first.slice(0, 120);
  return bareHost(target.hostname);
}

function summariseSearch(data, target, query) {
  const results = (data.results ?? []).slice(0, 10).map((r) => {
    let sameDomain = false;
    let isYou = false;
    try {
      const u = new URL(r.url);
      sameDomain = bareHost(u.hostname) === bareHost(target.hostname);
      isYou = sameDomain && barePath(u.pathname) === barePath(target.pathname);
    } catch {
      /* ignore malformed result URLs */
    }
    return { position: r.position, title: r.title, url: r.url, snippet: r.snippet, site: r.site_name, isYou, sameDomain };
  });
  const exact = results.find((r) => r.isYou);
  const domain = results.find((r) => r.sameDomain);
  return {
    ok: true,
    query,
    total: data.total_results ?? null,
    results,
    matched: exact ? exact.position : null,
    domainMatched: domain ? domain.position : null,
  };
}

export async function runAudit(input, { query } = {}) {
  const started = Date.now();
  const url = normalizeUrl(input);
  const target = await assertPublicUrl(url);
  const origin = target.origin;

  const [md, htmlFetch, raw, robotsRes, llmsRes, sitemapRes] = await Promise.all([
    tfFetch(url, { format: 'markdown', links: true }), // throws on auth / quota problems
    tfFetch(url, { format: 'html' }),
    attempt(rawGet(url)),
    attempt(rawGet(`${origin}/robots.txt`, { maxBytes: 300_000 })),
    attempt(rawGet(`${origin}/llms.txt`, { maxBytes: 300_000 })),
    attempt(rawGet(`${origin}/sitemap.xml`, { maxBytes: 300_000 })),
  ]);

  const robotsText = robotsRes.v?.status === 200 && !looksLikeHtml(robotsRes.v.text) ? robotsRes.v.text : '';
  const robots = {
    present: Boolean(robotsText),
    text: robotsText,
    blocked: robotsText ? AI_BOTS.filter((b) => !robotsAllows(robotsText, b, target.pathname || '/')) : [],
  };
  const llms = {
    present: llmsRes.v?.status === 200 && !looksLikeHtml(llmsRes.v.text) && llmsRes.v.text.trim().length > 0,
  };
  const sitemap = {
    present:
      (sitemapRes.v?.status === 200 && /<(urlset|sitemapindex)/i.test(sitemapRes.v.text)) ||
      /^\s*sitemap\s*:/im.test(robotsText),
  };

  // Search runs after the fetch because the default query comes from the page title.
  const matchTarget = (() => {
    try {
      return new URL(md.final_url ?? url);
    } catch {
      return target;
    }
  })();
  const q = String(query ?? '').trim() || deriveQuery(md.title, matchTarget);
  let search;
  try {
    search = summariseSearch(await tfSearch(q), matchTarget, q);
  } catch (e) {
    search = { ok: false, query: q, error: e.message };
  }

  // Start fetching the pages that outrank this one while the checks run.
  const rivalPick = pickRivals(search);
  const rivalsPromise = profileRivals(rivalPick.pool).catch(() => []);

  const rawText = raw.v ? mainText(raw.v.text) : '';
  const renderedHtml = htmlFetch.ok ? htmlFetch.text : '';
  const rawWords = raw.v ? countWords(rawText) : null;
  const renderedWords = renderedHtml ? countWords(mainText(renderedHtml)) : md.ok ? countWords(md.text) : null;

  const finalUrl = matchTarget.href;
  const facts = md.ok
    ? buildFacts({ finalUrl, rendered: md, rawHtml: raw.v?.text, renderedHtml })
    : null;

  const ctx = {
    pageUrl: url,
    rendered: md,
    renderedHtml: htmlFetch,
    raw: raw.v ?? null,
    rawError: raw.e?.message,
    robots,
    llms,
    sitemap,
    search,
    facts,
  };
  const checks = runChecks(ctx);
  const { overall, byCategory } = scoreChecks(checks);

  const readability = readabilityOf(checks);
  const connection = connect({
    search,
    you: { readability, signals: signalsOf(checks, renderedWords) },
    rivals: await rivalsPromise,
    label: rivalPick.label,
  });

  const issues = checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  const llm = await writeVerdict({
    url,
    title: md.title,
    description: md.description,
    excerpt: clip(md.ok ? md.text : rawText, 1500),
    score: overall,
    issues,
    connection,
  });
  const verdict = llm?.source === 'llm' ? llm : fallbackVerdict(overall, issues, llm?.error);

  return {
    url,
    finalUrl: md.final_url ?? raw.v?.finalUrl ?? url,
    auditedAt: new Date().toISOString(),
    totalMs: Date.now() - started,
    score: overall,
    grade: gradeFor(overall),
    readability,
    connection,
    page: { title: md.title ?? '', h1: facts?.h1 ?? '', description: md.description ?? '' },
    categories: CATEGORIES.map((c) => ({
      ...c,
      score: byCategory[c.id] ?? null,
      checks: checks.filter((k) => k.category === c.id),
    })),
    views: {
      raw: {
        available: Boolean(raw.v),
        status: raw.v?.status ?? null,
        words: rawWords,
        h1: raw.v ? firstH1(raw.v.text) : '',
        excerpt: clip(rawText, 1500),
      },
      rendered: {
        available: md.ok,
        words: renderedWords,
        h1: firstH1(renderedHtml),
        title: md.title ?? '',
        latencyMs: Number.isFinite(md.latency_ms) ? Math.round(md.latency_ms) : null,
        excerpt: clip(md.ok ? md.text : '', 1500),
      },
      sharePct: rawWords != null && renderedWords ? Math.min(100, Math.round((rawWords / renderedWords) * 100)) : null,
    },
    search,
    robots: { present: robots.present, blocked: robots.blocked },
    verdict,
  };
}
