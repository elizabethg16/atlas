// Deterministic, collision-free ID for regions/cities that lack a reliable unique code.
// Must stay in sync with the equivalent logic in frontend/src/App.jsx (cityStableId) -
// if you change the slugify rule here, update it there too, or lookups will mismatch.
function stableId(adm0_a3, name) {
  const slug = name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'unknown';
  return `${adm0_a3}-${slug}`;
}

// Country ID: ISO_A2, falling back past Natural Earth's '-99' placeholders
// (France, Norway, Kosovo, ...). Must match countryId in frontend/src/App.jsx.
function countryId(props) {
  const valid = (code) => code && code !== '-99';
  return [props.ISO_A2, props.ISO_A2_EH, props.ADM0_A3].find(valid);
}

module.exports = { stableId, countryId };
