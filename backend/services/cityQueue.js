const fs = require('fs');
const path = require('path');
const { findCityArticle } = require('./scraper');
const { stableId } = require('./stableId');

// Exact Wikipedia article titles for cities findCityArticle can't resolve on
// its own (e.g. misspelled in Natural Earth). Keyed by stableId(adm0_a3, name).
const ARTICLE_OVERRIDES = {
  'CHN-shenyeng': 'Shenyang',
  'CHN-jinxi': 'Huludao', // renamed in 1994
  'CHN-suzhou': 'Suzhou', // two Suzhous share this ID; use the Jiangsu one
  'IND-nagpur': 'Nagpur', // article has no coordinates for the distance check
  'CHN-jianmen': 'Tianmen', // misspelled; coordinates match Tianmen, Hubei
  'CHN-luan': "Lu'an",
  'CHN-taian': "Tai'an",
  'CHN-shuyang': 'Shuyang County', // "County" titles are rejected by findCityArticle
  'PAK-saidu': 'Saidu Sharif',
  'CHN-mudangiang': 'Mudanjiang',
  'MEX-nezahualcoyotl': 'Ciudad Nezahualcóyotl',
  'MEX-san-luis-potos-': 'San Luis Potosí (city)',
  'UKR-odessa': 'Odesa',
  'USA-birmingham': 'Birmingham, Alabama',
  'USA-columbus': 'Columbus, Ohio',
  'USA-norfolk': 'Norfolk, Virginia',
  'USA-providence': 'Providence, Rhode Island',
};

const citiesPath = path.join(__dirname, '../../frontend/public/cities.geojson');
const countriesPath = path.join(__dirname, '../../data/countries.geojson');

/**
 * The largest cities that don't have facts yet, at most `limit` of them.
 * Cities sharing an ID (e.g. the two Suzhous) appear once.
 */
function pendingCities(db, limit = Infinity) {
  const existingIds = new Set(
    db.prepare(`SELECT DISTINCT entity_id FROM facts WHERE entity_type = 'city'`)
      .all()
      .map((row) => row.entity_id)
  );

  const cities = JSON.parse(fs.readFileSync(citiesPath, 'utf-8'));
  const seen = new Set();
  const pending = [...cities.features]
    .sort((a, b) => (b.properties.pop_max || 0) - (a.properties.pop_max || 0))
    .filter((f) => {
      const id = stableId(f.properties.adm0_a3, f.properties.name);
      if (existingIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, limit);

  return { existingCount: existingIds.size, pending };
}

let countryNameByCode;

/**
 * Works out a city's ID and Wikipedia article title. Returns null (after
 * logging why) when the city should be skipped.
 */
async function resolveCity(feature) {
  if (!countryNameByCode) {
    countryNameByCode = {};
    JSON.parse(fs.readFileSync(countriesPath, 'utf-8')).features.forEach((f) => {
      countryNameByCode[f.properties.ADM0_A3] = f.properties.ADMIN;
    });
  }

  const cityName = feature.properties.name;
  const adm0a3 = feature.properties.adm0_a3;
  const [lon, lat] = feature.geometry.coordinates;

  if (!cityName || !adm0a3) {
    console.warn(`Skipping a city - missing name/country data`, feature.properties);
    return null;
  }

  const id = stableId(adm0a3, cityName);
  const articleTitle = ARTICLE_OVERRIDES[id]
    || await findCityArticle(cityName, countryNameByCode[adm0a3], lat, lon);
  if (!articleTitle) {
    console.warn(`Skipping ${cityName} (${id}) - no nearby Wikipedia article found; add it to ARTICLE_OVERRIDES`);
    return null;
  }

  return { id, cityName, articleTitle };
}

module.exports = { pendingCities, resolveCity };
