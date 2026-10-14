// Page facts and paste-ready snippets. Everything here is deterministic: snippets are filled with the
// page's own title, description, URL and links, so a site owner can paste them as they are.
import * as cheerio from 'cheerio';
import { mainText } from './text.js';

const FILE_EXT = /\.(png|jpe?g|gif|svg|webp|ico|css|js|json|xml|pdf|zip|mp4|mp3|woff2?)$/i;

export function siteNameFor(host, ogSiteName) {
  if (ogSiteName) return ogSiteName;
  const h = host.replace(/^www\./, '');
  const base = h.split('.')[0];
  return base ? base[0].toUpperCase() + base.slice(1) : h;
}

// First real paragraph of the rendered markdown, trimmed to a meta-description length.
export function suggestDescription(markdown, max = 155) {
  const paras = String(markdown ?? '')
    .split(/\n{2,}/)
    .map((p) =>
      p
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#*_`>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((p) => p.length >= 60 && !/^(skip to|menu|search)/i.test(p));
  const p = paras[0];
  if (!p) return '';
  if (p.length <= max) return p;
  const cut = p.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (stop > 70 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(' '))).trim();
}

export function keyPages(links, finalUrl, limit = 8) {
  let base;
  try {
    base = new URL(finalUrl);
  } catch {
    return [];
  }
  const seen = new Set([base.pathname.replace(/\/+$/, '') || '/']);
  const out = [];
  for (const l of links ?? []) {
    try {
      const u = new URL(l);
      if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
      const path = u.pathname.replace(/\/+$/, '') || '/';
      if (seen.has(path) || FILE_EXT.test(path) || path.split('/').length > 4) continue;
      seen.add(path);
      const last = path.split('/').filter(Boolean).pop() ?? 'home';
      const label = decodeURIComponent(last).replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
      out.push({ url: `${u.origin}${path}`, label });
      if (out.length >= limit) break;
    } catch {
      /* skip malformed link */
    }
  }
  return out;
}

export function buildFacts({ finalUrl, rendered, rawHtml, renderedHtml }) {
  const u = new URL(finalUrl);
  const $ = rawHtml ? cheerio.load(rawHtml) : null;
  const ogSite = $ ? $('meta[property="og:site_name"]').attr('content') : '';
  const h1 = (
    ($ && $('h1').first().text()) ||
    (renderedHtml ? cheerio.load(renderedHtml)('h1').first().text() : '') ||
    ''
  ).replace(/\s+/g, ' ').trim();
  return {
    finalUrl,
    origin: u.origin,
    host: u.hostname,
    siteName: siteNameFor(u.hostname, ogSite),
    title: (rendered?.title ?? '').trim(),
    description: (rendered?.description ?? '').trim(),
    h1,
    language: rendered?.language || 'en',
    links: rendered?.links ?? [],
    suggestedDescription: suggestDescription(rendered?.text) || suggestDescription(mainText(renderedHtml)),
  };
}

const q = (s) => String(s).replace(/"/g, '&quot;');

export const snippets = {
  jsonLd(f) {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: f.title || f.h1 || f.siteName,
      description: f.description || f.suggestedDescription || undefined,
      url: f.finalUrl,
      inLanguage: f.language,
      isPartOf: { '@type': 'WebSite', name: f.siteName, url: f.origin },
    };
    return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
  },
  canonical: (f) => `<link rel="canonical" href="${f.finalUrl}">`,
  lang: (f) => `<html lang="${f.language}">`,
  openGraph: (f) =>
    [
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${q(f.siteName)}">`,
      `<meta property="og:title" content="${q(f.title || f.h1 || f.siteName)}">`,
      `<meta property="og:description" content="${q(f.description || f.suggestedDescription)}">`,
      `<meta property="og:url" content="${f.finalUrl}">`,
      `<meta property="og:image" content="${f.origin}/og-image.png">`,
    ].join('\n'),
  descTag: (text) => (text ? `<meta name="description" content="${q(text)}">` : ''),
  titleTag: (text) => `<title>${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`,
  // Only used when the page has no title at all: built from the H1 and the site name.
  title(f) {
    const base = f.h1 || f.siteName;
    const t = base.toLowerCase().includes(f.siteName.toLowerCase()) ? base : `${base} | ${f.siteName}`;
    return snippets.titleTag(t.slice(0, 62));
  },
  llmsTxt(f) {
    const pages = keyPages(f.links, f.finalUrl);
    const lines = [`# ${f.siteName}`, '', `> ${f.description || f.suggestedDescription || 'Add a one-sentence summary of the site.'}`];
    if (pages.length) {
      lines.push('', '## Key pages', ...pages.map((p) => `- [${p.label}](${p.url})`));
    }
    return lines.join('\n');
  },
  sitemapLine: (f) => `Sitemap: ${f.origin}/sitemap.xml`,
  allowBots: (bots) =>
    ['# Let AI answer engines fetch pages', ...bots.flatMap((b) => ['', `User-agent: ${b}`, 'Allow: /'])].join('\n'),
};

// Names the client-rendering framework from an empty app shell, so the fix can be specific.
export function detectShell(rawHtml) {
  const h = String(rawHtml ?? '');
  if (/id=["']__next["']/.test(h) && /_next\/static/.test(h)) {
    return { name: 'Next.js', advice: 'This is a Next.js page whose content is fetched in the browser. Move that data fetching into a Server Component or generateStaticParams/getStaticProps so it ships in the HTML.' };
  }
  if (/id=["']__nuxt["']/.test(h) || /\/_nuxt\//.test(h)) {
    return { name: 'Nuxt', advice: 'Render the page on the server (Nuxt SSR/`nuxt generate`) instead of client-only components.' };
  }
  if (/<app-root/i.test(h) || /ng-version=/.test(h)) {
    return { name: 'Angular', advice: 'Add server-side rendering with `ng add @angular/ssr` so routes return HTML, not an empty <app-root>.' };
  }
  if (/id=["']root["']/.test(h) && /type=["']module["']|\/static\/js\/main/.test(h)) {
    return { name: 'a client-side React app (Vite / Create React App)', advice: 'The served HTML is an empty <div id="root">. Move to a server-rendering framework (Next.js, Remix) or prerender routes at build time.' };
  }
  if (/id=["']app["']/.test(h) && /vue/i.test(h)) {
    return { name: 'a client-side Vue app', advice: 'Use Nuxt (SSR/SSG) or vite-ssg so each route is prerendered to HTML.' };
  }
  return null;
}
