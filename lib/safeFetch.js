import dns from 'node:dns/promises';
import net from 'node:net';
import { UserError } from './errors.js';

// Looks like a basic crawler that does not run JavaScript.
const UA = 'Mozilla/5.0 (compatible; AgentLensBot/1.0; plain-http-crawler-simulation)';

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const l = ip.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:');
}

// The server fetches user-supplied URLs, so refuse anything that resolves to a private address.
export async function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new UserError('That does not look like a valid URL.');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new UserError('Only http(s) URLs can be audited.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) {
    throw new UserError('Local and private addresses cannot be audited.');
  }
  let addrs;
  try {
    addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch {
    throw new UserError(`Could not resolve ${host}.`);
  }
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new UserError('Local and private addresses cannot be audited.');
  }
  return u;
}

async function readCapped(res, maxBytes) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

// One plain GET, no JavaScript. Redirects are followed by hand so every hop is re-checked.
export async function rawGet(url, { maxBytes = 2_000_000, maxRedirects = 3 } = {}) {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,text/plain,application/xml;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(15_000),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, u).href;
      continue;
    }
    return {
      status: res.status,
      finalUrl: u.href,
      contentType: res.headers.get('content-type') ?? '',
      text: await readCapped(res, maxBytes),
    };
  }
  throw new Error('Too many redirects');
}
