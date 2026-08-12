require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { scrapeWikipediaArticle } = require('../services/scraper');
const { extractFacts } = require('../services/summarizer');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const insertFact = db.prepare(`
  INSERT INTO facts (entity_type, entity_id, entity_name, fact, source_url)
  VALUES (@entity_type, @entity_id, @entity_name, @fact, @source_url)
`);

const deleteExisting = db.prepare(`
  DELETE FROM facts WHERE entity_type = 'country' AND entity_id = ?
`);

async function generateForCountry(name, isoA2) {
  console.log(`Processing ${name} (${isoA2})...`);

  try {
    const article = await scrapeWikipediaArticle(name);
    if (!article.text || article.text.length < 200) {
      console.warn(`  Skipped - article too short or not found`);
      return;
    }

    const facts = await extractFacts(name, article.text);

   //no duplicates
   const insertMany = db.transaction((factList) => {
      deleteExisting.run(isoA2);
      for (const fact of factList) {
        insertFact.run({
          entity_type: 'country',
          entity_id: isoA2,
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

  // partial
  const countries = geojson.features.slice(10);

  for (const feature of countries) {
    const name = feature.properties.ADMIN;
    const isoA2 = feature.properties.ISO_A2;

    if (!isoA2 || isoA2 === '-99') {
      console.warn(`Skipping ${name} - no valid ISO_A2 code`);
      continue;
    }

    await generateForCountry(name, isoA2);
    await sleep(1000); 
  }

  console.log('Done.');
}

main();