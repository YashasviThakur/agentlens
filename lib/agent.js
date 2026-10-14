// Third TinyFish endpoint: a real agent visits the page and says what it understood and what got in
// the way. Static Fetch cannot see consent walls, pop-ups or a missing "what do I do next".
import { tfAgent } from './tinyfish.js';

const GOAL = `You are checking how clear this web page is to an AI agent that has never seen it.
Only look at this page. Do not log in, submit forms, search, or buy anything. Scroll if you need to.
If a cookie banner or pop-up covers the content, note it, and close it only if there is an obvious close or "essential only" control.
Return only a JSON object with exactly these keys:
- "what_it_is": string, one sentence on what this page or site is about
- "who_its_for": string, the intended audience, or null if unclear
- "primary_action": string, the main thing a visitor is invited to do (for example "Sign up", "Read the docs"), or null if unclear
- "key_facts": array of up to 3 short strings, concrete facts stated on the page (names, prices, dates, features)
- "blockers": array of strings, anything that got in the way of reading the page (cookie wall, login wall, pop-up, CAPTCHA, content that only appeared after scrolling or clicking); empty array if none
- "confidence": number from 0 to 1, how confident you are in "what_it_is"
Use null when something is not visible. Return only the JSON.`;

const STOP = new Set('the a an and or of to in on for with is are this that it its be by as at from your you our we'.split(' '));
const words = (s) => String(s ?? '').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((w) => !STOP.has(w)) ?? [];

function findAnswer(value, depth = 0) {
  if (!value || depth > 3) return null;
  if (typeof value === 'string') {
    const m = value.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return findAnswer(JSON.parse(m[0]), depth + 1);
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') {
    if ('what_it_is' in value) return value;
    for (const v of Object.values(value)) {
      const hit = findAnswer(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

export async function runAgentTest(url, { title = '', h1 = '', description = '' } = {}) {
  const run = await tfAgent(url, GOAL);
  if (!run.ok) {
    return { ok: false, error: run.error?.message ?? `Agent run ${run.status ?? 'failed'}` };
  }
  const a = findAnswer(run.result);
  if (!a) return { ok: false, error: 'The agent finished but did not return the requested JSON.' };

  const summary = {
    whatItIs: a.what_it_is ?? null,
    whoFor: a.who_its_for ?? null,
    primaryAction: a.primary_action ?? null,
    keyFacts: Array.isArray(a.key_facts) ? a.key_facts.slice(0, 3) : [],
    blockers: Array.isArray(a.blockers) ? a.blockers.filter(Boolean) : [],
    confidence: Number.isFinite(Number(a.confidence)) ? Number(a.confidence) : null,
  };

  const checks = [];
  const add = (id, label, status, detail, fix = '') => checks.push({ id, label, status, detail, fix });

  const c = summary.confidence;
  add('agent-understands', 'An agent can tell what the page is',
    !summary.whatItIs ? 'fail' : c == null || c >= 0.7 ? 'pass' : c >= 0.4 ? 'warn' : 'fail',
    summary.whatItIs ? `It concluded: “${summary.whatItIs}”${c != null ? ` (confidence ${Math.round(c * 100)}%)` : ''}.` : 'It could not work out what the page is about.',
    'Say plainly what the page is in the title, the H1 and the first sentence of the main content.');

  add('agent-action', 'An agent can find the main action',
    summary.primaryAction ? 'pass' : 'warn',
    summary.primaryAction ? `Primary action it found: “${summary.primaryAction}”.` : 'It could not tell what a visitor is meant to do next.',
    'Give the page one clearly labelled primary button or link.');

  add('agent-blockers', 'Nothing blocks an agent from reading it',
    summary.blockers.length === 0 ? 'pass' : 'warn',
    summary.blockers.length ? `It ran into: ${summary.blockers.join('; ')}.` : 'No consent wall, pop-up, login wall or CAPTCHA got in the way.',
    'Do not cover the main content with consent banners or pop-ups, and do not gate public content behind interaction.');

  const own = new Set(words(`${title} ${h1} ${description}`));
  const theirs = words(summary.whatItIs);
  const overlap = theirs.length ? theirs.filter((w) => own.has(w)).length / theirs.length : 0;
  if (own.size && theirs.length) {
    add('agent-matches', 'The page’s own words match what the agent understood',
      overlap >= 0.25 ? 'pass' : 'warn',
      overlap >= 0.25
        ? 'The title, H1 and description use the same vocabulary the agent used to describe the page.'
        : 'The agent’s description shares little vocabulary with your title, H1 and description, so your headline may be vague or off-topic.',
      'Rewrite the title and H1 using the words you would use to explain the page to a stranger.');
  }

  return { ok: true, steps: run.steps, summary, checks };
}
