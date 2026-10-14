// Crawlers AI products use. Retrieval bots fetch pages live to answer a user;
// the rest mostly gather training data.
export const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
];
export const RETRIEVAL_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-User'];

function parse(txt) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const m = raw.replace(/#.*$/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (field === 'allow' || field === 'disallow')) {
        cur.rules.push({ allow: field === 'allow', path: value });
      }
    }
  }
  return groups;
}

function ruleRegex(path) {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

// Longest matching rule wins; Allow wins ties. No matching group means allowed.
export function robotsAllows(txt, agent, pagePath = '/') {
  const groups = parse(txt);
  const a = agent.toLowerCase();
  const group = groups.find((g) => g.agents.includes(a)) ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  let best = { len: -1, allow: true };
  for (const r of group.rules) {
    if (!r.path || !ruleRegex(r.path).test(pagePath)) continue;
    const len = r.path.length;
    if (len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best.allow;
}
