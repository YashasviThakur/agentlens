import { NextResponse } from 'next/server';
import { runAudit, UserError } from '../../../lib/audit.js';

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
    return NextResponse.json(await runAudit(body?.url, { query: body?.query }));
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('audit failed:', e);
    return NextResponse.json({ error: e.message || 'The audit failed.' }, { status: 502 });
  }
}
