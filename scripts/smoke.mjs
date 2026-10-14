// node --env-file=.env.local scripts/smoke.mjs <url> [--query "search query"] [--agent] [--snippets]
import { runAudit } from '../lib/audit.js';
import { runAgentTest } from '../lib/agent.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = args.find((a) => !a.startsWith('--') && a !== opt('--query'));
if (!url) {
  console.error('usage: node --env-file=.env.local scripts/smoke.mjs <url> [--query "..."] [--agent] [--snippets]');
  process.exit(1);
}

try {
  const r = await runAudit(url, { query: opt('--query') });
  console.log(`\n${r.finalUrl}\nscore ${r.score} (${r.grade}) · readability ${r.readability} · ${(r.totalMs / 1000).toFixed(1)}s · verdict by ${r.verdict.source}`);
  console.log(r.verdict.headline);

  const c = r.connection;
  console.log(`\nREADABILITY ↔ VISIBILITY  [${c.quadrant ?? 'n/a'}]`);
  console.log(c.headline);
  if (c.rivals.length) {
    console.log(`compared against: ${c.comparedAgainst}`);
    for (const v of c.rivals) {
      console.log(`  #${v.position} ${v.site ?? ''} — ${v.fetched ? `readability ${v.readability}, ${v.signals.words ?? '?'} words, jsonLd ${v.signals.jsonLd}, jsFree ${v.signals.jsFree}` : `could not fetch (${v.error})`}`);
    }
  }
  for (const g of c.gaps) console.log(`  gap: ${g.text}`);

  for (const cat of r.categories) {
    console.log(`\n${cat.label.padEnd(10)} ${cat.score ?? '–'}`);
    for (const k of cat.checks) {
      console.log(`  ${k.status.padEnd(5)} ${k.label} — ${k.detail}`);
      if (flag('--snippets') && k.snippet) console.log(k.snippet.split('\n').map((l) => `        │ ${l}`).join('\n'));
    }
  }
  console.log(`\nraw words ${r.views.raw.words} | rendered words ${r.views.rendered.words} | share ${r.views.sharePct}%`);
  console.log('search:', r.search.ok ? `"${r.search.query}" → exact #${r.search.matched ?? '-'} domain #${r.search.domainMatched ?? '-'}` : r.search.error);

  if (flag('--agent')) {
    console.log('\nAGENT TEST (TinyFish Agent API) …');
    const t0 = Date.now();
    const a = await runAgentTest(r.finalUrl, r.page);
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`, a.ok ? `· ${a.steps ?? '?'} steps` : '');
    if (!a.ok) console.log('  failed:', a.error);
    else {
      console.log('  summary:', JSON.stringify(a.summary, null, 2).replace(/\n/g, '\n  '));
      for (const k of a.checks) console.log(`  ${k.status.padEnd(5)} ${k.label} — ${k.detail}`);
    }
  }
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
