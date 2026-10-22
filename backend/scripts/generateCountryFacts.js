require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { scrapeWikipediaArticle } = require('../services/scraper');
const { extractFacts } = require('../services/summarizer');
const { countryId } = require('../services/stableId');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const insertFact = db.prepare(`
  INSERT INTO facts (entity_type, entity_id, entity_name, fact, source_url)
  VALUES (@entity_type, @entity_id, @entity_name, @fact, @source_url)
`);

const deleteExisting = db.prepare(`
  DELETE FROM facts WHERE entity_type = 'country' AND entity_id = ?
`);

// Wikipedia titles for countries whose ADMIN name isn't the country's article.
const ARTICLE_OVERRIDES = {
  GE: 'Georgia (country)',
};

const existingCountryIds = new Set(
  db.prepare(`SELECT DISTINCT entity_id FROM facts WHERE entity_type = 'country'`)
    .all()
    .map((row) => row.entity_id)
);

async function generateForCountry(name, id) {
  const articleTitle = ARTICLE_OVERRIDES[id] || name;
  console.log(`Processing ${name} (${id})...`);

  try {
    const article = await scrapeWikipediaArticle(articleTitle);
    if (!article.text || article.text.length < 200) {
      console.warn(`  Skipped - article too short or not found`);
      return;
    }

    const facts = await extractFacts(name, article.text);

   //no duplicates
   const insertMany = db.transaction((factList) => {
      deleteExisting.run(id);
      for (const fact of factList) {
        insertFact.run({
          entity_type: 'country',
          entity_id: id,
          entity_name: name,
          fact,
          source_url: article.url,
        });
      }
    });
    insertMany(facts);

    console.log(`  Saved ${facts.length} facts`);
  } catch (err) {
    console.error(`  Failed for ${name}:`, err.message);
  }
}

async function main() {
  const geojsonPath = path.join(__dirname, '../../data/countries.geojson');
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));

  const countries = geojson.features
    .filter((f) => !existingCountryIds.has(countryId(f.properties)));

  console.log(`${existingCountryIds.size} countries already have facts, ${countries.length} to process.`);

  for (const feature of countries) {
    const name = feature.properties.ADMIN;
    await generateForCountry(name, countryId(feature.properties));
    await sleep(1000); 
  }

  console.log('Done.');
}

main();