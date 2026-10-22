// Loads hand-written city facts into the database. The file is a JSON array of
// { id, name, source_url, facts: [string] }, usually exportCityArticles.js
// output with `facts` filled in. Re-importing a city replaces its facts.
//
//   node scripts/importCityFacts.js city-facts.json
const fs = require('fs');
const db = require('../db');

const insertFact = db.prepare(`
  INSERT INTO facts (entity_type, entity_id, entity_name, fact, source_url)
  VALUES (@entity_type, @entity_id, @entity_name, @fact, @source_url)
`);

const deleteExisting = db.prepare(`
  DELETE FROM facts WHERE entity_type = 'city' AND entity_id = ?
`);

const cities = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));

const importAll = db.transaction(() => {
  for (const city of cities) {
    if (!Array.isArray(city.facts) || city.facts.length === 0) {
      console.warn(`Skipping ${city.name} (${city.id}) - no facts`);
      continue;
    }
    deleteExisting.run(city.id);
    for (const fact of city.facts) {
      insertFact.run({
        entity_type: 'city',
        entity_id: city.id,
        entity_name: city.name,
        fact,
        source_url: city.source_url,
      });
    }
    console.log(`Saved ${city.facts.length} facts for ${city.name}`);
  }
});

importAll();
