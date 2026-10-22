require('dotenv/config');
const db = require('../db');
const { scrapeWikipediaArticle } = require('../services/scraper');
const { extractFacts } = require('../services/summarizer');
const { pendingCities, resolveCity } = require('../services/cityQueue');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const insertFact = db.prepare(`
  INSERT INTO facts (entity_type, entity_id, entity_name, fact, source_url)
  VALUES (@entity_type, @entity_id, @entity_name, @fact, @source_url)
`);

const deleteExisting = db.prepare(`
  DELETE FROM facts WHERE entity_type = 'city' AND entity_id = ?
`);

async function generateForCity(cityName, searchTitle, id) {
  console.log(`Processing ${searchTitle}...`);

  try {
    const article = await scrapeWikipediaArticle(searchTitle);
    if (!article.text || article.text.length < 200) {
      console.warn(`  Skipped - article too short or not found`);
      return;
    }

    const facts = await extractFacts(searchTitle, article.text);

    const insertMany = db.transaction((factList) => {
      deleteExisting.run(id);
      for (const fact of factList) {
        insertFact.run({
          entity_type: 'city',
          entity_id: id,
          entity_name: cityName,
          fact,
          source_url: article.url,
        });
      }
    });
    insertMany(facts);

    console.log(`  Saved ${facts.length} facts`);
  } catch (err) {
    console.error(`  Failed for ${searchTitle}:`, err.message);
  }
}

async function main() {
  // Optional limit, e.g. `node scripts/generateCityFacts.js 50` for the 50
  // largest cities still missing facts. Omit it to process all of them.
  const limit = Number(process.argv[2]) || Infinity;
  const { existingCount, pending } = pendingCities(db, limit);

  console.log(`${existingCount} cities already have facts, ${pending.length} to process.`);

  for (const feature of pending) {
    const city = await resolveCity(feature);
    if (!city) continue;

    await generateForCity(city.cityName, city.articleTitle, city.id);
    await sleep(1000);
  }

  console.log('Done.');
}

main();
