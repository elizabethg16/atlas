const cheerio = require('cheerio');

const SKIP_SECTIONS = ['history', 'etymology', 'toponymy', 'government', 'politics',];
const PRIORITY_SECTIONS = ['economy', 'demographics', 'culture', 'society', 'sports', 'geography', 'climate'];

/**
 * Fetches a Wikipedia article and extracts body text, organized by section,
 * skipping history/etymology and prioritizing modern-content sections.
 */
async function scrapeWikipediaArticle(title) {
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CountryFactsApp/1.0 (educational project)' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  $('style, script').remove();

  const elements = $('#mw-content-text .mw-parser-output h2, #mw-content-text .mw-parser-output p');

  const sections = { intro: [] };
  let currentSection = 'intro';

  elements.each((_, el) => {
    const $el = $(el);

    // Use .is() rather than reading el.tagName directly - tagName isn't
    // reliably present on Cheerio's underlying DOM nodes across versions
    // (this silently broke the whole extraction last time - every element
    // fell through with tag === undefined, so nothing got collected at all)
    if ($el.is('h2')) {
      const headingText = $el.text().trim();
      currentSection = headingText.toLowerCase();
      if (!sections[currentSection]) sections[currentSection] = [];
    } else if ($el.is('p')) {
      const text = $el.text().trim().replace(/\[\d+\]/g, '').trim();
      if (text.length > 40) {
        sections[currentSection] = sections[currentSection] || [];
        sections[currentSection].push(text);
      }
    }
  });

  const isSkipped = (name) => SKIP_SECTIONS.some((s) => name.includes(s));
  const isPriority = (name) => PRIORITY_SECTIONS.some((s) => name.includes(s));

  const orderedSectionNames = Object.keys(sections).filter((name) => name !== 'intro');
  const priorityNames = orderedSectionNames.filter((name) => !isSkipped(name) && isPriority(name));
  const remainingNames = orderedSectionNames.filter((name) => !isSkipped(name) && !isPriority(name));

  const orderedParagraphs = [
    ...sections.intro,
    ...priorityNames.flatMap((name) => sections[name]),
    ...remainingNames.flatMap((name) => sections[name]),
  ];

  return {
    title,
    url,
    text: orderedParagraphs.join('\n\n'),
  };
}

module.exports = { scrapeWikipediaArticle };