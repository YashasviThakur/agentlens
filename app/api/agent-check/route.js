import { NextResponse } from 'next/server';
import { runAgentTest } from '../../../lib/agent.js';
import { assertPublicUrl } from '../../../lib/safeFetch.js';
import { UserError } from '../../../lib/errors.js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body like {"url": "https://example.com"}.' }, { status: 400 });
  }
  try {
    const u = await assertPublicUrl(body?.url);
    const result = await runAgentTest(u.href, {
      title: String(body?.title ?? '').slice(0, 300),
      h1: String(body?.h1 ?? '').slice(0, 300),
      description: String(body?.description ?? '').slice(0, 500),
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('agent check failed:', e);
    return NextResponse.json({ ok: false, error: e.message || 'The agent test failed.' }, { status: 200 });
  }
}
