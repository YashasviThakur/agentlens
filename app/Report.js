'use client';

import { useState } from 'react';

const LABEL = { pass: 'Pass', warn: 'Improve', fail: 'Fix', skip: 'Skipped' };
const tone = (n) => (n == null ? 'skip' : n >= 80 ? 'pass' : n >= 55 ? 'warn' : 'fail');

function Ring({ score, grade }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={`ring ${tone(score)}`} role="img" aria-label={`Score ${score} out of 100, grade ${grade}`}>
      <svg viewBox="0 0 120 120" width="148" height="148" aria-hidden="true">
        <circle cx="60" cy="60" r={r} className="ring-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="ring-bar"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="ring-label">
        <strong>{score}</strong>
        <span>Grade {grade}</span>
      </div>
    </div>
  );
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Snippet({ text }) {
  if (!text) return null;
  return (
    <div className="snippet">
      <CopyButton text={text} />
      <pre>{text}</pre>
    </div>
  );
}

const yes = (v) => (v ? <span className="pass">yes</span> : <span className="fail">no</span>);

function Connection({ c, you }) {
  const rows = c.rivals ?? [];
  return (
    <div className="card">
      <h3>Readability ↔ visibility</h3>
      <p className="muted">How easy AI tools find the page to use, against how visible it is in search, and what the pages around it do differently.</p>

      <div className="meters">
        <div className="meter">
          <span className="meter-label">AI readability</span>
          <strong className={tone(c.readability)}>{c.readability}<small>/100</small></strong>
          <div className="bar" aria-hidden="true"><span className={tone(c.readability)} style={{ width: `${c.readability}%` }} /></div>
        </div>
        <div className="meter">
          <span className="meter-label">Search position{c.query ? ` for “${c.query}”` : ''}</span>
          <strong className={c.position ? (c.position <= 5 ? 'pass' : 'warn') : 'fail'}>
            {c.quadrant ? (c.position ? `#${c.position}` : 'not in top 10') : 'n/a'}
          </strong>
        </div>
      </div>

      <p className={`callout ${c.quadrant?.startsWith('visible-readable') ? 'pass' : c.quadrant ? 'warn' : 'skip'}`}>{c.headline}</p>

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="rivals">
            <caption>Compared with the {c.comparedAgainst}</caption>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Page</th>
                <th>Readability</th>
                <th>Words</th>
                <th>JSON-LD</th>
                <th>Text in HTML</th>
              </tr>
            </thead>
            <tbody>
              <tr className="you-row">
                <td>{c.position ? `#${c.position}` : '–'}</td>
                <td>This page</td>
                <td className={tone(c.readability)}>{c.readability}</td>
                <td>{you.words ?? '–'}</td>
                <td>{yes(you.jsonLd)}</td>
                <td>{yes(you.jsFree)}</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.url}>
                  <td>#{r.position}</td>
                  <td>
                    <a href={r.url} target="_blank" rel="noreferrer">{r.site || r.url}</a>
                  </td>
                  {r.fetched || r.readability != null ? (
                    <>
                      <td className={tone(r.readability)}>{r.readability}</td>
                      <td>{r.signals.words ?? '–'}</td>
                      <td>{yes(r.signals.jsonLd)}</td>
                      <td>{yes(r.signals.jsFree)}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="muted">Could not be fetched ({r.error})</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {c.gaps.length > 0 && (
        <>
          <h4 className="sub">What they do that this page does not</h4>
          <ul className="gaps">
            {c.gaps.map((g) => (
              <li key={g.signal}>{g.text}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AgentCard({ agent }) {
  if (!agent || agent.phase === 'off') return null;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Agent test</h3>
        <span className="tag-soft">TinyFish Agent API</span>
      </div>
      {agent.phase === 'loading' && (
        <p className="muted" aria-live="polite">
          A TinyFish agent is opening the page in a real browser and reporting what it understood. This takes about 30–45 seconds.
        </p>
      )}
      {agent.phase === 'error' && <p className="muted">The agent test could not complete: {agent.message}</p>}
      {agent.phase === 'done' && (
        <>
          <p className="muted">
            An agent visited the live page{agent.data.steps ? ` (${agent.data.steps} steps)` : ''} and said:
          </p>
          <dl className="agent-summary">
            <dt>What it thinks this is</dt>
            <dd>{agent.data.summary.whatItIs || 'It could not tell.'}</dd>
            <dt>Who it is for</dt>
            <dd>{agent.data.summary.whoFor || 'Unclear.'}</dd>
            <dt>Main action</dt>
            <dd>{agent.data.summary.primaryAction || 'Unclear.'}</dd>
            {agent.data.summary.keyFacts.length > 0 && (
              <>
                <dt>Facts it picked up</dt>
                <dd>{agent.data.summary.keyFacts.join(' · ')}</dd>
              </>
            )}
          </dl>
          <ul className="checks">
            {agent.data.checks.map((k) => (
              <li key={k.id}>
                <span className={`status ${k.status}`}>{LABEL[k.status]}</span>
                <div>
                  <strong>{k.label}</strong>
                  <p>{k.detail}</p>
                  {k.status !== 'pass' && k.fix && <p className="fix">{k.fix}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function Report({ report, agent }) {
  const { score, grade, categories, views, search, verdict, robots, connection } = report;
  const host = (() => {
    try {
      return new URL(report.finalUrl).hostname;
    } catch {
      return report.finalUrl;
    }
  })();
  const gap = views.sharePct;
  const gapTone = gap == null ? 'skip' : gap >= 80 ? 'pass' : gap >= 40 ? 'warn' : 'fail';
  const youSignals = (() => {
    const find = (id) => categories.flatMap((c) => c.checks).find((k) => k.id === id)?.status === 'pass';
    return { words: views.rendered.words, jsonLd: find('json-ld'), jsFree: find('js-dependence') };
  })();

  return (
    <section className="report" aria-label="Audit report">
      <div className="card summary">
        <Ring score={score} grade={grade} />
        <div>
          <p className="eyebrow">{host}</p>
          <h2>{verdict.headline}</h2>
          <p className="muted">
            {(report.totalMs / 1000).toFixed(1)}s ·{' '}
            {verdict.source === 'llm' ? `verdict by ${verdict.model}` : 'rule-based verdict'}
          </p>
        </div>
      </div>

      <div className="cats">
        {categories.map((c) => (
          <div key={c.id} className="card cat">
            <div className="cat-head">
              <h3>{c.label}</h3>
              <strong className={tone(c.score)}>{c.score ?? '–'}</strong>
            </div>
            <div className="bar" aria-hidden="true">
              <span className={tone(c.score)} style={{ width: `${c.score ?? 0}%` }} />
            </div>
            <p className="muted">{c.question}</p>
          </div>
        ))}
      </div>

      <Connection c={connection} you={youSignals} />

      <div className="card">
        <h3>What an AI tool sees</h3>
        {gap != null && (
          <p className={`callout ${gapTone}`}>
            {gap >= 80
              ? `${gap}% of the page’s text is in the raw HTML, so even crawlers that skip JavaScript can read it.`
              : `Only ${gap}% of the page’s text is in the raw HTML. The rest appears after JavaScript runs, so crawlers that skip JS never see it.`}
          </p>
        )}
        <div className="split">
          <div>
            <h4>Plain HTTP crawler (no JavaScript)</h4>
            <p className="meta">
              {views.raw.available
                ? `HTTP ${views.raw.status} · ${views.raw.words} words · H1: ${views.raw.h1 || 'none'}`
                : 'Request failed'}
            </p>
            <pre>{views.raw.excerpt || 'Nothing readable came back.'}</pre>
          </div>
          <div>
            <h4>Real browser (TinyFish Fetch)</h4>
            <p className="meta">
              {views.rendered.available
                ? `${views.rendered.words} words · ${
                    views.rendered.latencyMs ? `${views.rendered.latencyMs} ms` : 'rendered'
                  }${views.rendered.title ? ` · ${views.rendered.title}` : ''}`
                : 'Fetch failed'}
            </p>
            <pre>{views.rendered.excerpt || 'Nothing readable came back.'}</pre>
          </div>
        </div>
      </div>

      {verdict.fixes?.length > 0 && (
        <div className="card">
          <h3>Fix these first</h3>
          <ol className="fixes">
            {verdict.fixes.map((f, i) => (
              <li key={i}>
                <strong>{f.title}</strong>
                <p>{f.why}</p>
                <Snippet text={f.snippet} />
              </li>
            ))}
          </ol>
        </div>
      )}

      <AgentCard agent={agent} />

      <div className="card">
        <h3>Search results</h3>
        {search.ok ? (
          <>
            <p className="muted">
              TinyFish Search for “{search.query}”
              {search.matched
                ? ` — this page ranks #${search.matched}.`
                : search.domainMatched
                  ? ` — your domain appears at #${search.domainMatched}, not this page.`
                  : ' — this page and domain are not in the top results.'}
            </p>
            <ol className="results">
              {search.results.slice(0, 6).map((r) => (
                <li key={r.url} className={r.isYou ? 'you' : r.sameDomain ? 'same' : ''}>
                  <span className="pos">{r.position}</span>
                  <div>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.title || r.url}
                    </a>
                    {r.isYou && <em className="tag">this page</em>}
                    {!r.isYou && r.sameDomain && <em className="tag">your domain</em>}
                    <p>{r.site}</p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="muted">Search check unavailable: {search.error}</p>
        )}
      </div>

      <div className="card">
        <h3>All checks</h3>
        {categories.map((c) => (
          <details key={c.id} className="group" open={c.checks.some((k) => k.status === 'fail')}>
            <summary>
              <span>{c.label}</span>
              <span className={`pill ${tone(c.score)}`}>{c.score ?? '–'}</span>
            </summary>
            <ul className="checks">
              {c.checks.map((k) => (
                <li key={k.id}>
                  <span className={`status ${k.status}`}>{LABEL[k.status]}</span>
                  <div>
                    <strong>{k.label}</strong>
                    <p>{k.detail}</p>
                    {k.status !== 'pass' && k.status !== 'skip' && k.fix && <p className="fix">{k.fix}</p>}
                    {k.status !== 'pass' && k.status !== 'skip' && <Snippet text={k.snippet} />}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {robots.present && robots.blocked.length > 0 && (
          <p className="muted">Blocked in robots.txt: {robots.blocked.join(', ')}</p>
        )}
      </div>
    </section>
  );
}
