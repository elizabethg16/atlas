require('dotenv/config');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { scrapeWikipediaArticle } = require('../services/scraper');
const { extractFacts } = require('../services/summarizer');
const { stableId } = require('../services/stableId');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const insertFact = db.prepare(`
  INSERT INTO facts (entity_type, entity_id, entity_name, fact, source_url)
  VALUES (@entity_type, @entity_id, @entity_name, @fact, @source_url)
`);

const deleteExisting = db.prepare(`
  DELETE FROM facts WHERE entity_type = 'city' AND entity_id = ?
`);

const existingCityIds = new Set(
  db.prepare(`SELECT DISTINCT entity_id FROM facts WHERE entity_type = 'city'`)
    .all()
    .map((row) => row.entity_id)
);

async function generateForCity(cityName, countryName, id) {
  const searchTitle = `${cityName}, ${countryName}`;
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
  const citiesPath = path.join(__dirname, '../../frontend/public/cities.geojson');
  const countriesPath = path.join(__dirname, '../../data/countries.geojson');

  const cities = JSON.parse(fs.readFileSync(citiesPath, 'utf-8'));
  const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf-8'));

  const countryNameByCode = {};
  countriesData.features.forEach((f) => {
    countryNameByCode[f.properties.ADM0_A3] = f.properties.ADMIN;
  });

  // Optional limit, e.g. `node scripts/generateCityFacts.js 50` for the 50
  // largest cities still missing facts. Omit it to process all of them.
  const limit = Number(process.argv[2]) || Infinity;

  const cityFeatures = [...cities.features]
    .sort((a, b) => (b.properties.pop_max || 0) - (a.properties.pop_max || 0))
    .filter((f) => !existingCityIds.has(stableId(f.properties.adm0_a3, f.properties.name)))
    .slice(0, limit);

  console.log(`${existingCityIds.size} cities already have facts, ${cityFeatures.length} to process.`);

  for (const feature of cityFeatures) {
    const cityName = feature.properties.name;
    const adm0a3 = feature.properties.adm0_a3;
    const countryName = countryNameByCode[adm0a3];

    if (!cityName || !adm0a3 || !countryName) {
      console.warn(`Skipping a city - missing name/country data`, feature.properties);
      continue;
    }

    const id = stableId(adm0a3, cityName);
    await generateForCity(cityName, countryName, id);
    await sleep(1000);
  }

  console.log('Done.');
}

main();
