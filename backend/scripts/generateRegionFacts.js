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
  DELETE FROM facts WHERE entity_type = 'region' AND entity_id = ?
`);

async function generateForRegion(regionName, countryName, id) {
  const searchTitle = `${regionName}, ${countryName}`;
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
          entity_type: 'region',
          entity_id: id,
          entity_name: regionName,
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
  const admin1Path = path.join(__dirname, '../../data/admin1.geojson');
  const countriesPath = path.join(__dirname, '../../data/countries.geojson');

  const admin1 = JSON.parse(fs.readFileSync(admin1Path, 'utf-8'));
  const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf-8'));

  const countryNameByCode = {};
  countriesData.features.forEach((f) => {
    countryNameByCode[f.properties.ADM0_A3] = f.properties.ADMIN;
  });

  const regions = admin1.features.slice(0, 5);

  for (const feature of regions) {
    const regionName = feature.properties.name;
    const adm0a3 = feature.properties.adm0_a3;
    const countryName = countryNameByCode[adm0a3];

    if (!regionName || !adm0a3 || !countryName) {
      console.warn(`Skipping a region - missing name/country data`, feature.properties);
      continue;
    }

    const id = stableId(adm0a3, regionName);
    await generateForRegion(regionName, countryName, id);
    await sleep(1000);
  }

  console.log('Done.');
}

main();
