import { NextResponse } from 'next/server';
import { readAgentTest, startAgentTest } from '../../../lib/agent.js';
import { assertPublicUrl } from '../../../lib/safeFetch.js';
import { UserError } from '../../../lib/errors.js';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Two actions so no request waits on the agent:
//   { action: 'start', url }                          -> { runId }
//   { action: 'poll', runId, title?, h1?, description? } -> { status: 'running' } | { ok, summary, checks }
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  try {
    if (body?.action === 'start') {
      const u = await assertPublicUrl(body.url);
      return NextResponse.json({ runId: await startAgentTest(u.href) });
    }
    if (body?.action === 'poll') {
      const clip = (v, n) => String(v ?? '').slice(0, n);
      return NextResponse.json(
        await readAgentTest(String(body.runId ?? ''), {
          title: clip(body.title, 300),
          h1: clip(body.h1, 300),
          description: clip(body.description, 500),
        }),
      );
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('agent check failed:', e);
    return NextResponse.json({ ok: false, error: e.message || 'The agent test failed.' });
  }
}
