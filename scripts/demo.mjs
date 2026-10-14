// Audits a set of real pages and writes demo/RESULTS.md + demo/results.json.
//   node --env-file=.env.local scripts/demo.mjs            (audit + agent test)
//   node --env-file=.env.local scripts/demo.mjs --no-agent (skip the agent test)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit } from '../lib/audit.js';
import { runAgentTest } from '../lib/agent.js';

const PAGES = [
  ['https://todomvc.com/examples/react/dist/', 'A client-rendered React app'],
  ['https://react.dev', 'A well-built documentation site'],
  ['https://www.dtu.ac.in', 'Delhi Technological University'],
  ['https://www.tinyfish.ai', 'The sponsor’s own site'],
  ['https://news.ycombinator.com', 'Plain HTML, almost no metadata'],
  ['https://en.wikipedia.org/wiki/Search_engine_optimization', 'A content page on the topic itself'],
];

const withAgent = !process.argv.includes('--no-agent');
const results = [];

for (const [url, note] of PAGES) {
  process.stdout.write(`${url} … `);
  try {
    const r = await runAudit(url);
    let agent = null;
    if (withAgent) {
      try {
        agent = await runAgentTest(r.finalUrl, r.page);
      } catch (e) {
        agent = { ok: false, error: e.message };
      }
    }
    results.push({ url, note, report: r, agent });
    console.log(`score ${r.score}, readability ${r.readability}, ${r.connection.quadrant ?? 'n/a'}`);
  } catch (e) {
    results.push({ url, note, error: e.message });
    console.log(`FAILED: ${e.message}`);
  }
}

const out = fileURLToPath(new URL('../demo', import.meta.url));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));

const pos = (c) => (c.position ? `#${c.position}` : c.quadrant ? 'not top 10' : 'n/a');
const lines = [
  '# AgentLens demo: real pages',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} against the live pages, using TinyFish Search, Fetch and Agent.`,
  '',
  '| Page | Score | AI readability | Search position | Reading |',
  '|---|---|---|---|---|',
];
for (const x of results) {
  if (x.error) {
    lines.push(`| ${x.url} | – | – | – | Could not be audited: ${x.error} |`);
    continue;
  }
  const { report: r } = x;
  lines.push(`| [${new URL(r.finalUrl).hostname}${new URL(r.finalUrl).pathname.length > 1 ? new URL(r.finalUrl).pathname : ''}](${r.finalUrl}) | ${r.score} (${r.grade}) | ${r.readability} | ${pos(r.connection)} | ${x.note} |`);
}

for (const x of results) {
  if (x.error) continue;
  const { report: r, agent } = x;
  lines.push('', `## ${r.finalUrl}`, '', `*${x.note}.* Score **${r.score} (${r.grade})**, AI readability **${r.readability}**, search position **${pos(r.connection)}** for “${r.connection.query ?? 'n/a'}”.`, '');
  lines.push(`> ${r.connection.headline}`, '');
  if (r.connection.rivals.length) {
    lines.push(`Compared with the ${r.connection.comparedAgainst}:`, '');
    for (const v of r.connection.rivals) {
      lines.push(`- #${v.position} ${v.site ?? v.url}: ${v.fetched ? `readability ${v.readability}, ${v.signals.words ?? '?'} words, JSON-LD ${v.signals.jsonLd ? 'yes' : 'no'}` : `not fetchable (${v.error})`}`);
    }
    lines.push('');
  }
  if (r.connection.gaps.length) {
    lines.push('What the others do that this page does not:', '', ...r.connection.gaps.map((g) => `- ${g.text}`), '');
  }
  const fixes = r.verdict.fixes.slice(0, 3);
  if (fixes.length) {
    lines.push('Top fixes:', '', ...fixes.map((f, i) => `${i + 1}. **${f.title}**: ${f.why.split('\n')[0]}`), '');
  }
  if (agent?.ok) {
    lines.push(`Agent test (${agent.steps ?? '?'} steps): “${agent.summary.whatItIs}” Main action: ${agent.summary.primaryAction ?? 'unclear'}.${agent.summary.blockers.length ? ` Blockers: ${agent.summary.blockers.join('; ')}.` : ''}`, '');
  } else if (agent) {
    lines.push(`Agent test did not complete: ${agent.error}`, '');
  }
}

fs.writeFileSync(path.join(out, 'RESULTS.md'), lines.join('\n') + '\n');
console.log(`\nWrote ${path.join(out, 'RESULTS.md')}`);
