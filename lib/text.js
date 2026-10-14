import * as cheerio from 'cheerio';

export function visibleText(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script,style,noscript,template,svg,iframe,head').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

// Main-content text: <main>, else <article>, else the body minus nav/header/footer/aside.
// TinyFish's cleaned HTML is main content only, so this keeps raw-vs-rendered comparable.
export function mainText(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script,style,noscript,template,svg,iframe,head,nav,header,footer,aside').remove();
  const scope = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('body');
  return scope.text().replace(/\s+/g, ' ').trim();
}

export function countWords(text) {
  return (String(text ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

export function clip(text, n = 1500) {
  const s = String(text ?? '');
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}

export function firstH1(html) {
  if (!html) return '';
  return cheerio.load(html)('h1').first().text().replace(/\s+/g, ' ').trim();
}

// SPAs often answer every path (including /llms.txt) with their index.html and a 200.
export function looksLikeHtml(text) {
  return /^\s*<(!doctype|html|head|body)/i.test(text ?? '');
}
