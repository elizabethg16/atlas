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

const USER_AGENT = 'CountryFactsApp/1.0 (educational project)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Queries the MediaWiki API, backing off when Wikipedia rate-limits us
// (it answers with a plain-text "too many requests" body, not JSON).
async function queryWikipedia(params) {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'coordinates|pageprops',
    ppprop: 'disambiguation',
    ...params,
  })}`;

  for (let wait = 2000; wait <= 64000; wait *= 2) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const body = await res.text();
    if (res.ok && body.startsWith('{')) return JSON.parse(body).query?.pages || [];
    console.warn(`  Rate limited by Wikipedia, retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error('Wikipedia API kept rate limiting');
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// "Springfield, Massachusetts" / "Hue (city)" -> "springfield" / "hue", accents stripped
const baseName = (title) => title
  .replace(/\s*\(.*\)$/, '')
  .split(',')[0]
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim();

const MAX_DISTANCE_KM = 50;

// "Fukuoka, Japan" redirects to "Fukuoka Prefecture", whose coordinates are
// close enough to pass the distance check, so reject administrative areas.
const ADMIN_AREA = /\b(prefecture|province|governorate|oblast|state|county|region)\b/i;

/**
 * Finds the English Wikipedia article for a city by trying likely titles and
 * accepting only a non-disambiguation page whose coordinates are near the
 * city's point. Article naming varies by country ("Chicago", "Austin, Texas",
 * "New York City"), so "<city>, <country>" alone misses many. Returns null
 * if nothing nearby matches.
 */
async function findCityArticle(cityName, countryName, lat, lon) {
  const nearby = (pages) => pages
    .filter((p) => !p.missing && !p.pageprops && p.coordinates && !ADMIN_AREA.test(p.title))
    .filter((p) => distanceKm(lat, lon, p.coordinates[0].lat, p.coordinates[0].lon) < MAX_DISTANCE_KM);

  const exactTitles = [countryName && `${cityName}, ${countryName}`, cityName].filter(Boolean);
  for (const title of exactTitles) {
    const [match] = nearby(await queryWikipedia({ titles: title }));
    if (match) return match.title;
  }

  // Search is looser, so also require the article's name to match the city's
  // (otherwise "Springfield" can land on "Springfield Armory"). "<name> City"
  // also counts, for articles like "New York City".
  const wanted = baseName(cityName);
  const results = await queryWikipedia({
    generator: 'search',
    gsrsearch: [cityName, countryName].filter(Boolean).join(' '),
    gsrlimit: '5',
  });
  const match = nearby(results)
    .filter((p) => [wanted, `${wanted} city`].includes(baseName(p.title)))
    .sort((a, b) => a.index - b.index)[0];
  return match ? match.title : null;
}

module.exports = { scrapeWikipediaArticle, findCityArticle };