'use client';

import { useRef, useState } from 'react';
import Report from './Report';

const SAMPLES = ['todomvc.com/examples/react/dist/', 'react.dev', 'dtu.ac.in'];

const STAGES = [
  'Requesting the page like a plain crawler, no JavaScript',
  'Rendering it in a real browser with TinyFish Fetch',
  'Searching the web for the page’s own topic with TinyFish Search',
  'Fetching the pages that rank around it and scoring them the same way',
  'Writing the fixes',
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [useAgent, setUseAgent] = useState(true);
  const [state, setState] = useState({ phase: 'idle' });
  const [agent, setAgent] = useState({ phase: 'off' });
  const runId = useRef(0);

  async function run(target) {
    const u = (target ?? url).trim();
    if (!u || state.phase === 'loading') return;
    const id = ++runId.current;
    setUrl(u);
    setAgent({ phase: 'off' });
    setState({ phase: 'loading' });
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u, query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The audit failed.');
      if (id !== runId.current) return;
      setState({ phase: 'done', report: data });
      if (useAgent) runAgent(id, data);
    } catch (e) {
      if (id === runId.current) setState({ phase: 'error', message: e.message });
    }
  }

  // The agent takes ~40s, so the report shows first and the agent test slots in when it is done.
  async function runAgent(id, report) {
    setAgent({ phase: 'loading' });
    try {
      const res = await fetch('/api/agent-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: report.finalUrl, ...report.page }),
      });
      const data = await res.json();
      if (id !== runId.current) return;
      if (!res.ok || !data.ok) throw new Error(data.error || 'The agent test failed.');
      setAgent({ phase: 'done', data });
    } catch (e) {
      if (id === runId.current) setAgent({ phase: 'error', message: e.message });
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">AgentLens</p>
        <h1>See your page the way AI sees it.</h1>
        <p className="lede">
          Paste a URL. We read it like a plain crawler and like a real browser, check where it ranks, compare it with the
          pages around it, and tell you what to change, with the code to paste.
        </p>

        <form
          className="audit-form"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <label className="sr-only" htmlFor="url">
            URL to audit
          </label>
          <input
            id="url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://your-site.com/page"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" className="primary" disabled={state.phase === 'loading' || !url.trim()}>
            {state.phase === 'loading' ? 'Auditing…' : 'Audit page'}
          </button>
        </form>

        <div className="options">
          <details className="advanced">
            <summary>Target search query (optional)</summary>
            <input
              type="text"
              aria-label="Target search query"
              placeholder="Defaults to the page title"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </details>
          <label className="check">
            <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
            Also run the agent test (TinyFish Agent, about 40s)
          </label>
        </div>

        <div className="samples">
          <span>Try</span>
          {SAMPLES.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => run(s)} disabled={state.phase === 'loading'}>
              {s}
            </button>
          ))}
        </div>
      </header>

      {state.phase === 'loading' && (
        <section className="card loading" aria-live="polite">
          <h2>Auditing {url}</h2>
          <ul>
            {STAGES.map((s, i) => (
              <li key={s} style={{ animationDelay: `${i * 0.25}s` }}>
                {s}
              </li>
            ))}
          </ul>
          <p className="muted">This usually takes 20–35 seconds.</p>
        </section>
      )}

      {state.phase === 'error' && (
        <section className="card error" role="alert">
          <h2>Couldn’t audit that page</h2>
          <p>{state.message}</p>
        </section>
      )}

      {state.phase === 'done' && <Report report={state.report} agent={agent} />}

      <section className="card how" aria-label="How TinyFish is used">
        <h3>How TinyFish is used</h3>
        <div className="how-grid">
          <div>
            <strong>Search API</strong>
            <p>Searches the page’s own topic to see where it ranks and which pages rank above it.</p>
          </div>
          <div>
            <strong>Fetch API</strong>
            <p>
              Renders the page, and each page that outranks it, in a real browser. Set against a plain HTTP request, it
              shows exactly what only appears after JavaScript runs.
            </p>
          </div>
          <div>
            <strong>Agent API</strong>
            <p>Sends an agent to the live page to check it can tell what the page is and find the main action.</p>
          </div>
        </div>
      </section>

      <footer className="foot">
        Built on <a href="https://docs.tinyfish.ai/" target="_blank" rel="noreferrer">TinyFish</a> Search, Fetch and Agent.
      </footer>
    </main>
  );
}
