// Optional: an LLM turns the failing checks into a short verdict and paste-ready fixes.
// Everything works without it; fallbackVerdict() builds the same shape from the rules.
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const SYSTEM = `You audit web pages for AI-readiness: how well AI search and fetch tools can read, understand and cite them, and how that relates to how visible the page is in search.
You are given the page title, description, an excerpt of how an AI tool sees it, the overall score, the failing checks, and how the page compares with the pages that rank for the same query.
Reply with JSON only: {"headline": string, "fixes": [{"title": string, "why": string, "snippet": string}]}.
- headline: one plain sentence (max 24 words) that ties readability to search visibility for THIS page.
- fixes: 2 to 4 items, most impactful first. "why" is one or two sentences and, where the comparison supports it, says what the higher-ranking pages do that this one does not. "snippet" is ready-to-paste HTML, JSON-LD or text tailored to THIS page (use its real title and topic), or "" if none applies.
Be specific to the page. Do not invent facts about the business.`;

export async function writeVerdict({ url, title, description, excerpt, score, issues, connection }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: JSON.stringify({
              url,
              title,
              description,
              score,
              readability: connection?.readability,
              searchPosition: connection?.position,
              query: connection?.query,
              comparison: connection?.gaps?.map((g) => g.text),
              failingChecks: issues.map((c) => ({ id: c.id, status: c.status, label: c.label, detail: c.detail })),
              excerptSeenByAI: excerpt,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = JSON.parse((await res.json()).choices?.[0]?.message?.content ?? '{}');
    const fixes = (Array.isArray(data.fixes) ? data.fixes : []).slice(0, 4).map((f) => ({
      title: String(f.title ?? '').slice(0, 120),
      why: String(f.why ?? '').slice(0, 400),
      snippet: String(f.snippet ?? '').slice(0, 1500),
    })).filter((f) => f.title);
    if (!data.headline || !fixes.length) throw new Error('Empty verdict');
    return { source: 'llm', model: MODEL, headline: String(data.headline).slice(0, 240), fixes };
  } catch (e) {
    return { source: 'rules', error: e.message };
  }
}

export function fallbackVerdict(score, issues, note) {
  const rank = { fail: 0, warn: 1 };
  const worst = [...issues]
    .sort((a, b) => rank[a.status] - rank[b.status] || (b.snippet ? 1 : 0) - (a.snippet ? 1 : 0) || b.weight - a.weight)
    .slice(0, 4);
  const headline =
    score >= 90 ? 'Well prepared: AI tools can reach, read and understand this page.'
    : score >= 70 ? 'Mostly readable by AI tools, with a few gaps worth closing.'
    : score >= 50 ? 'AI tools can reach this page but will miss or misread parts of it.'
    : 'AI search and fetch tools will struggle to read or cite this page.';
  return {
    source: 'rules',
    headline,
    note,
    fixes: worst.map((c) => ({
      title: c.label,
      why: [c.detail, c.fix].filter(Boolean).join(' '),
      snippet: c.snippet || '',
    })),
  };
}
