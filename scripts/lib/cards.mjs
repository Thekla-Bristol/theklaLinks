// Layout-agnostic "card" finder.
// Listing pages change their markup, but each event always shows a date string.
// We find the deepest element whose text is a date, then climb to the largest
// ancestor that still contains exactly one date — that ancestor is the event card.

/** Visible text lines inside an element, in document order. */
export function textLines($, el) {
  const lines = [];
  const walk = (node) => {
    if (node.type === 'text') {
      const t = node.data.replace(/\s+/g, ' ').trim();
      if (t) lines.push(t);
    } else if (node.children && !['script', 'style', 'noscript'].includes(node.tagName)) {
      node.children.forEach(walk);
    }
  };
  walk(el);
  return lines;
}

/** Element text with a separator between text nodes (so "26" + "Brother" don't fuse). */
export const spacedText = ($, el) => textLines($, el).join('\n');

export function findCards($, dateRe) {
  const global = new RegExp(dateRe.source, 'gi');
  const count = (el) => (spacedText($, el).match(global) || []).length;
  const seen = new Set();
  const cards = [];

  $('body *').each((_, el) => {
    if (['script', 'style', 'noscript'].includes(el.tagName)) return;
    const own = spacedText($, el);
    if (own.length > 200 || !dateRe.test(own)) return;
    // must be the deepest element containing the date
    if ($(el).children().toArray().some((c) => dateRe.test(spacedText($, c)))) return;

    let card = el;
    while (card.parent && card.parent.tagName && card.parent.tagName !== 'body' && count(card.parent) === 1) {
      card = card.parent;
    }
    if (seen.has(card)) return;
    seen.add(card);
    cards.push({ card, dateEl: el, match: dateRe.exec(own) });
  });
  return cards;
}

const TITLE_SEL = 'h1,h2,h3,h4,h5,h6,strong,b,[class*="title"],[class*="name"],[class*="artist"],[class*="headline"]';

/**
 * Best title inside a card: the title-like element nearest *before* the date
 * (falls back to the first one after it). Skips section headings like
 * "Recently Announced" because those are further away than the event's own title.
 */
export function nearestTitle($, card, dateEl, isNoise) {
  const all = $(card).find('*').toArray();
  const dateIdx = all.indexOf(dateEl);
  const cands = $(card).find(TITLE_SEL).toArray()
    .map((el) => ({ el, idx: all.indexOf(el), text: textLines($, el).join(' ').trim() }))
    .filter((c) => c.text && c.text.length < 160 && !isNoise(c.text) && !c.el.children?.some?.((k) => k.type === 'tag' && $(k).is(TITLE_SEL)));
  const before = cands.filter((c) => c.idx < dateIdx);
  const pick = before.length ? before[before.length - 1] : cands[0];
  return pick ? pick.text : '';
}
