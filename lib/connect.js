// Connects readability to visibility: the pages that outrank (or stand in the way of) this one are
// fetched and scored with the same checks, so the report can say which gaps they don't have.
import { tfFetchMany } from './tinyfish.js';
import { rawGet } from './safeFetch.js';
import { runChecks, scoreChecks } from './checks.js';
import { countWords, mainText } from './text.js';

const SKIP_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip|png|jpe?g|mp4)$/i;
const READABILITY_CATEGORIES = ['rendering', 'structure'];

// How well AI tools can read the page: rendering + structure. Access and discovery are reported separately.
export const readabilityOf = (checks) =>
  scoreChecks(checks.filter((c) => READABILITY_CATEGORIES.includes(c.category))).overall;

export function signalsOf(checks, words) {
  const pass = (id) => checks.find((c) => c.id === id)?.status === 'pass';
  return {
    jsFree: pass('js-dependence'),
    jsonLd: pass('json-ld'),
    openGraph: pass('open-graph'),
    canonical: pass('canonical'),
    metaDescription: pass('meta-description'),
    singleH1: pass('h1-single'),
    words,
  };
}

// Picks the pages worth comparing against: whoever outranks the page, else the top results.
export function pickRivals(search, limit = 4) {
  if (!search?.ok) return { pool: [], label: '' };
  const usable = (r) => !r.sameDomain && r.url && !SKIP_EXT.test(r.url);
  const above = search.matched ? search.results.filter((r) => r.position < search.matched && usable(r)) : [];
  if (above.length) return { pool: above.slice(0, limit), label: 'pages ranking above you' };
  return { pool: search.results.filter(usable).slice(0, limit), label: 'top results for this query' };
}

export async function profileRivals(pool) {
  if (!pool.length) return [];
  const [fetched, raws] = await Promise.all([
    tfFetchMany(pool.map((p) => p.url), { format: 'html' }).catch(() => new Map()),
    Promise.all(pool.map((p) => rawGet(p.url).then((v) => ({ v }), (e) => ({ e })))),
  ]);

  return pool.map((p, i) => {
    const base = { position: p.position, title: p.title, url: p.url, site: p.site };
    const tf =
      fetched.get(p.url) ?? [...fetched.values()].find((x) => x.final_url === p.url) ?? { ok: false, error: 'not_returned' };
    const raw = raws[i].v ?? null;
    if (!tf.ok && !raw) return { ...base, fetched: false, error: tf.error ?? raws[i].e?.message ?? 'unreachable' };

    const checks = runChecks({
      pageUrl: p.url,
      rendered: tf,
      renderedHtml: tf.ok ? tf : null,
      raw,
      rawError: raws[i].e?.message,
      robots: { present: false, text: '', blocked: [] },
      llms: { present: false },
      sitemap: { present: false },
      search: { ok: false },
    });
    const words = tf.ok ? countWords(mainText(tf.text)) : null;
    return {
      ...base,
      fetched: tf.ok,
      error: tf.ok ? undefined : tf.error,
      readability: readabilityOf(checks),
      signals: signalsOf(checks, words),
    };
  });
}

const GAPS = [
  ['jsonLd', 'publish structured data (JSON-LD)'],
  ['openGraph', 'set Open Graph tags'],
  ['canonical', 'declare a canonical URL'],
  ['metaDescription', 'have a well-sized meta description'],
  ['jsFree', 'serve their main text in the initial HTML'],
  ['singleH1', 'use exactly one <h1>'],
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

export function connect({ search, you, rivals, label }) {
  const out = {
    query: search?.query ?? null,
    position: null,
    readability: you.readability,
    quadrant: null,
    headline: 'Search visibility could not be checked, so readability is shown on its own.',
    comparedAgainst: label,
    rivals,
    gaps: [],
  };
  if (!search?.ok) return out;

  const position = search.matched ?? null;
  const visible = position != null && position <= 5;
  const readable = you.readability >= 70;
  out.position = position;
  out.quadrant = `${visible ? 'visible' : 'hidden'}-${readable ? 'readable' : 'unreadable'}`;
  const q = `“${search.query}”`;
  out.headline = {
    'visible-readable': `Visible and readable: you rank #${position} for ${q} and AI tools can use the page. This is the combination AI answers reward.`,
    'visible-unreadable': `You rank #${position} for ${q}, but AI tools get little usable from the page (readability ${you.readability}/100). Search sends people to you; AI answers will skip or misquote you.`,
    'hidden-readable': `AI tools read this page well (readability ${you.readability}/100), but it does not surface for ${q}. Markup is not the problem; relevance and links are.`,
    'hidden-unreadable': `This page is hard for AI tools to read (${you.readability}/100) and does not surface for ${q}. Fix readability first: it is the cheaper half.`,
  }[out.quadrant];

  const ok = rivals.filter((r) => r.fetched && r.signals);
  const need = Math.max(2, Math.ceil(ok.length / 2));
  const where = label || 'ranking for this topic';
  if (ok.length >= 2) {
    for (const [key, verb] of GAPS) {
      const n = ok.filter((r) => r.signals[key]).length;
      if (!you.signals[key] && n >= need) {
        out.gaps.push({ signal: key, text: `${n} of ${ok.length} ${where} ${verb}. This one does not.` });
      }
    }
    const med = median(ok.map((r) => r.signals.words).filter((w) => w != null));
    if (med && med >= 300 && you.signals.words != null && you.signals.words < med * 0.6) {
      out.gaps.push({
        signal: 'words',
        text: `The ${where} carry about ${med} words of main content. This one has ${you.signals.words}.`,
      });
    }
    const avg = Math.round(ok.reduce((a, r) => a + r.readability, 0) / ok.length);
    if (avg - you.readability >= 10) {
      out.gaps.push({ signal: 'readability', text: `Their average readability is ${avg}/100 against your ${you.readability}.` });
    }
  }
  const blocked = rivals.filter((r) => !r.fetched);
  if (blocked.length) {
    out.gaps.push({
      signal: 'rivalBlocked',
      text: `${blocked.length} of the ${where} could not be fetched by TinyFish (${[...new Set(blocked.map((b) => b.error))].join(', ')}). They are visible in search but not readable to AI fetch tools, which is an opening.`,
    });
  }
  return out;
}
