import * as cheerio from 'cheerio';
import { countWords, mainText } from './text.js';
import { RETRIEVAL_BOTS } from './robots.js';
import { detectShell, snippets } from './facts.js';

export const CATEGORIES = [
  { id: 'access', label: 'Access', question: 'Can AI tools reach it?' },
  { id: 'rendering', label: 'Rendering', question: 'Does the content survive without JavaScript?' },
  { id: 'structure', label: 'Structure', question: 'Can a model understand it?' },
  { id: 'discovery', label: 'Discovery', question: 'Does search surface it?' },
];

const mk = (id, category, label, weight, status, detail, fix = '', snippet = '') => ({
  id,
  category,
  label,
  weight,
  status, // pass | warn | fail | skip
  detail,
  fix,
  snippet, // paste-ready, filled with the page's own values; empty when nothing applies
});

const LLMS_TXT_EXAMPLE = '# Your Site\n> One sentence on what the site is.\n\n## Key pages\n- [Docs](https://example.com/docs): how to get started';

const STRUCTURE_CHECKS = [
  ['title', 'Descriptive <title>', 2],
  ['meta-description', 'Meta description', 2],
  ['h1-single', 'Exactly one <h1>', 1],
  ['heading-order', 'Headings nest in order', 1],
  ['json-ld', 'Structured data (JSON-LD)', 2],
  ['canonical', 'Canonical URL', 1],
  ['lang', 'Language declared', 1],
  ['open-graph', 'Open Graph tags', 1],
  ['image-alt', 'Images have alt text', 1],
  ['landmarks', 'Semantic landmarks', 1],
];

/**
 * ctx: { pageUrl, rendered, renderedHtml, raw, rawError, robots, llms, sitemap, search }
 *  rendered      TinyFish Fetch (markdown): { ok, text, title, description, language, links, latency_ms, error }
 *  renderedHtml  TinyFish Fetch (html):     { ok, text }  — cleaned main content: no <head>, scripts or images
 *  raw           plain HTTP GET:            { status, text } or null
 *  robots        { present, text, blocked: string[] }
 */
export function runChecks(ctx) {
  const out = [];
  const add = (...args) => out.push(mk(...args));
  const target = new URL(ctx.pageUrl);
  const f = ctx.facts; // present for the audited page only; rivals get no snippets
  const snip = (build) => (f ? build(f) : '');

  // ---------- Access ----------
  if (ctx.rendered?.ok) {
    const ms = Number.isFinite(ctx.rendered.latency_ms) ? `${Math.round(ctx.rendered.latency_ms)} ms` : 'a moment';
    add('fetch-ok', 'access', 'AI fetch tools can load the page', 3, 'pass', `TinyFish Fetch rendered it in ${ms}.`);
  } else {
    const code = ctx.rendered?.error ?? 'unknown';
    const gated = code === 'bot_blocked' || code === 'login_required';
    add('fetch-ok', 'access', 'AI fetch tools can load the page', 3, 'fail',
      `TinyFish Fetch could not read the page (${code}).`,
      gated
        ? 'Let automated readers past your bot protection or login wall, or expose a public version of the content.'
        : code === 'timeout' || code === 'unreachable'
          ? 'The page did not load in time. If this repeats, it is too slow for AI fetch tools, which give up after a few seconds. Check server response time.'
          : 'Make sure the URL is public and returns real content.');
  }

  if (ctx.raw) {
    const s = ctx.raw.status;
    add('http-status', 'access', 'A plain HTTP request returns 200', 2,
      s >= 200 && s < 300 ? 'pass' : s >= 400 ? 'fail' : 'warn',
      `A crawler that does not run JavaScript got HTTP ${s}.`,
      s >= 400 ? 'Serve the page to crawlers: check WAF rules, geo blocks and user-agent filters.' : '');
  } else {
    add('http-status', 'access', 'A plain HTTP request returns 200', 2, 'fail',
      `A plain HTTP request failed${ctx.rawError ? ` (${ctx.rawError})` : ''}. Many AI crawlers will fail the same way.`,
      'Check that the server answers simple GET requests without a browser.');
  }

  if (!ctx.robots.present) {
    add('robots-ai', 'access', 'robots.txt lets AI crawlers in', 2, 'pass', 'No robots.txt found, so nothing is blocked.');
  } else {
    const blocked = ctx.robots.blocked;
    const retrieval = blocked.filter((b) => RETRIEVAL_BOTS.includes(b));
    if (!blocked.length) {
      add('robots-ai', 'access', 'robots.txt lets AI crawlers in', 2, 'pass', 'GPTBot, ClaudeBot, PerplexityBot and the other major AI crawlers are allowed.');
    } else if (retrieval.length) {
      add('robots-ai', 'access', 'robots.txt lets AI crawlers in', 2, 'fail',
        `Blocked: ${blocked.join(', ')}. ${retrieval.join(', ')} fetch pages live to answer user questions, so this page cannot be cited.`,
        `Remove the Disallow rules for ${retrieval.join(', ')} if you want this page to appear in AI answers. Add this to robots.txt:`,
        snippets.allowBots(retrieval));
    } else {
      add('robots-ai', 'access', 'robots.txt lets AI crawlers in', 2, 'warn',
        `Training crawlers are blocked: ${blocked.join(', ')}. Answer engines can still fetch the page.`,
        'Fine if intentional. Allow them if you want to be part of model training data.');
    }
  }

  add('llms-txt', 'access', 'Publishes an llms.txt index', 1, ctx.llms.present ? 'pass' : 'warn',
    ctx.llms.present ? 'Found /llms.txt.' : 'No /llms.txt. It is a short markdown map that tells LLMs what the site is and where the best pages are.',
    f ? 'Publish this at /llms.txt (generated from this page and its links):' : `Add /llms.txt, for example:\n${LLMS_TXT_EXAMPLE}`,
    ctx.llms.present ? '' : snip(snippets.llmsTxt));

  add('sitemap', 'access', 'Has a sitemap', 1, ctx.sitemap.present ? 'pass' : 'warn',
    ctx.sitemap.present ? 'A sitemap is available.' : 'No sitemap.xml found and none declared in robots.txt.',
    'Publish /sitemap.xml and reference it from robots.txt with a Sitemap: line.',
    ctx.sitemap.present ? '' : snip(snippets.sitemapLine));

  // ---------- Rendering ----------
  const rawHtml = ctx.raw?.text ?? '';
  const renHtml = ctx.renderedHtml?.ok ? ctx.renderedHtml.text : '';
  // Both sides are compared on main content so site chrome (nav, footer) can't mask a JS-only body.
  const rawWords = ctx.raw ? countWords(mainText(rawHtml)) : null;
  const renWords = renHtml ? countWords(mainText(renHtml)) : ctx.rendered?.ok ? countWords(ctx.rendered.text) : null;

  if (rawWords == null || renWords == null) {
    add('js-dependence', 'rendering', 'Content is in the raw HTML, not injected by JavaScript', 3, 'skip', 'Needs both a plain request and a rendered fetch.');
  } else {
    const share = renWords ? Math.min(1, rawWords / renWords) : 1;
    const pct = Math.round(share * 100);
    add('js-dependence', 'rendering', 'Content is in the raw HTML, not injected by JavaScript', 3,
      share >= 0.8 ? 'pass' : share >= 0.4 ? 'warn' : 'fail',
      share >= 0.8
        ? `${pct >= 100 ? 'All' : `${pct}%`} of the page's main text (${renWords} words once rendered) is already in the HTML served to crawlers.`
        : `Only ${pct}% of the page's main text is in the HTML served to crawlers (${rawWords} of ${renWords} words). The rest appears only after JavaScript runs, so crawlers that skip JS never see it.`,
      (() => {
        const shell = detectShell(rawHtml);
        return shell
          ? `Detected ${shell.name}. ${shell.advice}`
          : 'Server-render or statically generate the main content (SSR / SSG / prerender) so it ships in the first HTML response.';
      })());
  }

  const $raw = rawHtml ? cheerio.load(rawHtml) : null;
  const $ren = renHtml ? cheerio.load(renHtml) : null;
  const rawH1 = $raw ? $raw('h1').length : 0;
  const renH1 = $ren ? $ren('h1').length : 0;
  if (rawH1 > 0) {
    add('raw-h1', 'rendering', 'The main heading is in the raw HTML', 1, 'pass', 'An <h1> is present before any JavaScript runs.');
  } else if (renH1 > 0) {
    add('raw-h1', 'rendering', 'The main heading is in the raw HTML', 1, 'fail',
      'The <h1> only appears after JavaScript runs.', 'Render the primary heading on the server.');
  } else {
    add('raw-h1', 'rendering', 'The main heading is in the raw HTML', 1, 'skip', 'No <h1> found either way (see Structure).');
  }

  if (renWords == null) {
    add('content-length', 'rendering', 'The page has enough text to be useful', 1, 'skip', 'No rendered content to measure.');
  } else {
    add('content-length', 'rendering', 'The page has enough text to be useful', 1,
      renWords >= 150 ? 'pass' : renWords >= 50 ? 'warn' : 'fail',
      `${renWords} words of readable main content after rendering.`,
      'Thin pages give a model little to quote. Add the substance a reader would look for: what it is, who it is for, key facts.');
  }

  // ---------- Structure ----------
  // TinyFish's HTML is cleaned main content (no <head>, scripts or images), so head signals come from
  // the HTML as served, and TinyFish's own title/description fields tell "absent" from "set only by JS".
  if (!$raw && !$ren) {
    for (const [id, label, w] of STRUCTURE_CHECKS) add(id, 'structure', label, w, 'skip', 'No HTML available to inspect.');
  } else {
    const rawShell = rawWords != null && rawWords < 30 && renWords > rawWords;
    const $body = $raw && !rawShell ? $raw : $ren ?? $raw;
    const bodyIsRendered = $body === $ren && $ren !== $raw;

    const rawTitle = $raw ? ($raw('head > title').first().text() || $raw('title').first().text()).trim() : '';
    const renTitle = (ctx.rendered?.title ?? '').trim();
    const title = rawTitle || renTitle;
    const titleJsOnly = !rawTitle && Boolean(renTitle) && Boolean($raw);
    add('title', 'structure', 'Descriptive <title>', 2,
      !title ? 'fail' : titleJsOnly ? 'warn' : title.length >= 20 && title.length <= 65 ? 'pass' : 'warn',
      title
        ? `"${title}" (${title.length} characters).${titleJsOnly ? ' It is set by JavaScript, so crawlers that skip JS see no title.' : ''}`
        : 'No <title> found.',
      f && titleJsOnly
        ? 'Put the title in the HTML you serve, not only in JavaScript:'
        : f && !title
          ? 'Add a title. A starting point built from your H1 and site name:'
          : 'Write a specific title of 20–65 characters, in the served HTML, that says what the page is.',
      f && titleJsOnly ? snippets.titleTag(renTitle) : f && !title ? snippets.title(f) : '');

    const rawDesc = $raw ? ($raw('meta[name="description"]').attr('content') ?? '').trim() : '';
    const renDesc = (ctx.rendered?.description ?? '').trim();
    const desc = rawDesc || renDesc;
    const descJsOnly = !rawDesc && Boolean(renDesc) && Boolean($raw);
    add('meta-description', 'structure', 'Meta description', 2,
      !desc ? 'fail' : descJsOnly ? 'warn' : desc.length >= 70 && desc.length <= 160 ? 'pass' : 'warn',
      desc
        ? `${desc.length} characters: "${desc.slice(0, 120)}${desc.length > 120 ? '…' : ''}"${descJsOnly ? ' It is set by JavaScript, so crawlers that skip JS miss it.' : ''}`
        : 'No meta description found.',
      f && descJsOnly
        ? 'Put the description in the HTML you serve, not only in JavaScript:'
        : f && !desc && f.suggestedDescription
          ? 'Add a description. A draft taken from your opening paragraph; edit it before use:'
          : 'Add <meta name="description"> of 70–160 characters summarising the page in plain language.',
      f && descJsOnly ? snippets.descTag(renDesc) : f && !desc ? snippets.descTag(f.suggestedDescription) : '');

    const h1s = $body('h1').length;
    add('h1-single', 'structure', 'Exactly one <h1>', 1,
      h1s === 1 ? 'pass' : h1s === 0 ? 'fail' : 'warn',
      h1s === 1 ? `"${$body('h1').first().text().replace(/\s+/g, ' ').trim().slice(0, 100)}"` : `Found ${h1s} <h1> elements.`,
      'Use a single <h1> that names the page, and <h2>/<h3> for sections.');

    let prev = 0;
    let jumps = 0;
    $body('h1,h2,h3,h4,h5,h6').each((_, el) => {
      const level = Number(el.tagName.slice(1));
      if (prev && level > prev + 1) jumps++;
      prev = level;
    });
    add('heading-order', 'structure', 'Headings nest in order', 1, jumps === 0 ? 'pass' : 'warn',
      jumps === 0 ? 'No skipped heading levels.' : `${jumps} heading(s) jump down more than one level (such as h2 straight to h4).`,
      'Do not skip levels; models use the outline to understand how the page is organised.');

    if (!$raw) {
      for (const [id, label, w] of STRUCTURE_CHECKS.filter(([id]) => ['json-ld', 'canonical', 'lang', 'open-graph', 'image-alt'].includes(id))) {
        add(id, 'structure', label, w, 'skip', 'Needs the HTML served to crawlers, and the plain request failed.');
      }
    } else {
      const types = [];
      let ldBlocks = 0;
      let ldValid = 0;
      $raw('script[type="application/ld+json"]').each((_, el) => {
        ldBlocks++;
        try {
          const data = JSON.parse($raw(el).contents().text());
          ldValid++;
          const walk = (n) => {
            if (Array.isArray(n)) return n.forEach(walk);
            if (n && typeof n === 'object') {
              if (n['@type']) types.push(...[].concat(n['@type']));
              if (n['@graph']) walk(n['@graph']);
            }
          };
          walk(data);
        } catch {
          /* invalid block */
        }
      });
      add('json-ld', 'structure', 'Structured data (JSON-LD)', 2, ldValid ? 'pass' : 'fail',
        ldValid
          ? `${ldValid} valid block(s): ${[...new Set(types)].slice(0, 6).join(', ') || 'no @type found'}.`
          : ldBlocks ? `${ldBlocks} JSON-LD block(s) found but none parse as valid JSON.` : 'No JSON-LD in the served HTML. Models and search engines lean on it to know what the page is about.',
        f ? 'Add this to the <head> and refine the @type (Article, Product, SoftwareApplication, FAQPage…) to match the page:' : 'Add schema.org JSON-LD that matches the page (Organization, Article, Product, SoftwareApplication, FAQPage…).',
        ldValid ? '' : snip(snippets.jsonLd));

      const canonical = $raw('link[rel="canonical"]').attr('href');
      add('canonical', 'structure', 'Canonical URL', 1, canonical ? 'pass' : 'warn',
        canonical ? canonical : 'No <link rel="canonical"> in the served HTML.',
        'Add a canonical link so duplicates (tracking params, www/non-www) collapse to one URL.',
        canonical ? '' : snip(snippets.canonical));

      const lang = $raw('html').attr('lang');
      add('lang', 'structure', 'Language declared', 1, lang ? 'pass' : 'warn',
        lang ? `<html lang="${lang}">` : `No lang attribute on <html>${ctx.rendered?.language ? ` (TinyFish detected "${ctx.rendered.language}")` : ''}.`,
        'Set the language on the root element.',
        lang ? '' : snip(snippets.lang));

      const og = ['og:title', 'og:description', 'og:image'].filter((p) => $raw(`meta[property="${p}"]`).attr('content'));
      add('open-graph', 'structure', 'Open Graph tags', 1,
        og.length === 3 ? 'pass' : og.length ? 'warn' : 'fail',
        og.length === 3 ? 'og:title, og:description and og:image are set.' : `Present: ${og.join(', ') || 'none'}.`,
        'Set og:title, og:description and og:image so previews and link unfurlers describe the page correctly. Replace the og:image URL with a real 1200×630 image:',
        og.length === 3 ? '' : snip(snippets.openGraph));

      if (bodyIsRendered) {
        add('image-alt', 'structure', 'Images have alt text', 1, 'skip',
          'The served HTML is an empty shell and the rendered view strips images, so there is nothing to inspect.');
      } else {
        const imgs = $raw('img');
        const withAlt = imgs.filter((_, el) => $raw(el).attr('alt') !== undefined).length;
        const cover = imgs.length ? withAlt / imgs.length : 1;
        add('image-alt', 'structure', 'Images have alt text', 1,
          cover >= 0.9 ? 'pass' : cover >= 0.6 ? 'warn' : 'fail',
          imgs.length ? `${withAlt} of ${imgs.length} images have an alt attribute.` : 'No images on the page.',
          'Give meaningful images descriptive alt text; use alt="" for purely decorative ones.');
      }
    }

    const landmarks = $body('main,article,[role="main"]').length;
    add('landmarks', 'structure', 'Semantic landmarks', 1, landmarks ? 'pass' : 'warn',
      landmarks ? 'Uses <main> or <article>.' : 'No <main> or <article> element.',
      'Wrap the primary content in <main> so tools can separate it from navigation and footers.');
  }

  // ---------- Discovery ----------
  const s = ctx.search;
  if (!s?.ok) {
    add('search-presence', 'discovery', 'Shows up when its own topic is searched', 3, 'skip',
      s?.error ? `Search check unavailable: ${s.error}` : 'Search check unavailable.');
  } else if (s.matched) {
    add('search-presence', 'discovery', 'Shows up when its own topic is searched', 3,
      s.matched <= 5 ? 'pass' : 'warn',
      `Ranked #${s.matched} for "${s.query}".`,
      s.matched > 5 ? 'Sharpen the title, headings and opening paragraph around the query people would actually use.' : '');
  } else if (s.domainMatched) {
    add('search-presence', 'discovery', 'Shows up when its own topic is searched', 3, 'warn',
      `Your domain appears (#${s.domainMatched}) for "${s.query}", but not this exact page.`,
      'Make this page the clear best answer for the query: a focused title, an H1 and an intro that match it.');
  } else {
    add('search-presence', 'discovery', 'Shows up when its own topic is searched', 3, 'fail',
      `Neither this page nor its domain appears in the top results for "${s.query}".`,
      'Check indexing, add internal links to the page, and align the title and headings with the query.');
  }

  const links = ctx.rendered?.links;
  if (!Array.isArray(links)) {
    add('link-graph', 'discovery', 'Links out to the rest of the site', 1, 'skip', 'No link data returned.');
  } else {
    const host = target.hostname.replace(/^www\./, '');
    const internal = links.filter((l) => {
      try {
        return new URL(l).hostname.replace(/^www\./, '') === host;
      } catch {
        return false;
      }
    }).length;
    add('link-graph', 'discovery', 'Links out to the rest of the site', 1,
      internal >= 5 ? 'pass' : internal >= 1 ? 'warn' : 'fail',
      `${internal} internal link(s) found out of ${links.length} total.`,
      'Link to related pages with descriptive anchor text so crawlers can walk the site.');
  }

  return out;
}

const VALUE = { pass: 1, warn: 0.5, fail: 0 };

export function scoreChecks(checks) {
  const cat = {};
  let earned = 0;
  let total = 0;
  for (const c of checks) {
    if (c.status === 'skip') continue;
    const slot = (cat[c.category] ??= { earned: 0, total: 0 });
    slot.earned += VALUE[c.status] * c.weight;
    slot.total += c.weight;
    earned += VALUE[c.status] * c.weight;
    total += c.weight;
  }
  const pct = (e, t) => (t ? Math.round((e / t) * 100) : null);
  return {
    overall: pct(earned, total) ?? 0,
    byCategory: Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, pct(v.earned, v.total)])),
  };
}

export function gradeFor(score) {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
}
