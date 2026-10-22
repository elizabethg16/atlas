// Scrapes articles for the next cities missing facts and writes each one's
// summarizer prompt to a JSON file, so facts can be written without calling
// the API. Load the results back with importCityFacts.js.
//
//   node scripts/exportCityArticles.js 10 city-articles.json
const fs = require('fs');
const db = require('../db');
const { scrapeWikipediaArticle } = require('../services/scraper');
const { buildFactsPrompt } = require('../services/summarizer');
const { pendingCities, resolveCity } = require('../services/cityQueue');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const limit = Number(process.argv[2]) || 10;
  const outPath = process.argv[3] || 'city-articles.json';
  const { existingCount, pending } = pendingCities(db, limit);

  console.log(`${existingCount} cities already have facts, exporting ${pending.length}.`);

  const exported = [];
  for (const feature of pending) {
    const city = await resolveCity(feature);
    if (!city) continue;

    try {
      const article = await scrapeWikipediaArticle(city.articleTitle);
      if (!article.text || article.text.length < 200) {
        console.warn(`  Skipped ${city.articleTitle} - article too short or not found`);
        continue;
      }
      exported.push({
        id: city.id,
        name: city.cityName,
        source_url: article.url,
        prompt: buildFactsPrompt(city.articleTitle, article.text),
      });
      console.log(`Exported ${city.articleTitle}`);
    } catch (err) {
      console.error(`  Failed for ${city.articleTitle}:`, err.message);
    }
    await sleep(1000);
  }

  fs.writeFileSync(outPath, JSON.stringify(exported, null, 2));
  console.log(`Wrote ${exported.length} cities to ${outPath}`);
}

main();
