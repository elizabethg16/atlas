const cheerio = require('cheerio');

/**
 * Fetches a Wikipedia article and extracts its main body text.
 * Strips citations, style/script tags, and navigation - keeps just readable prose,
 * since that's what we want to feed the summarizer, not markup noise.
 */
async function scrapeWikipediaArticle(title) {
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CountryFactsApp/1.0 (educational project)' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove inline <style>/<script> content before extracting text, or CSS rules
  // leak into the scraped paragraphs (Cheerio's .text() includes them otherwise)
  $('style, script').remove();

  // Use a descendant selector, not a direct-child one - Wikipedia's current skin
  // (Vector 2022) nests paragraphs inside <section> wrappers, so they're no longer
  // direct children of .mw-parser-output
  const paragraphs = [];
  $('#mw-content-text .mw-parser-output p').each((_, el) => {
    const text = $(el).text().trim();
    // Strip citation markers like [1], [23]
    const cleaned = text.replace(/\[\d+\]/g, '').trim();
    if (cleaned.length > 40) paragraphs.push(cleaned); // skip near-empty stub paragraphs
  });

  return {
    title,
    url,
    text: paragraphs.join('\n\n'),
  };
}

module.exports = { scrapeWikipediaArticle };
