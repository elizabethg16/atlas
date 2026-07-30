// Deterministic, collision-free ID for regions/cities that lack a reliable unique code.
// Must stay in sync with the equivalent logic in frontend/src/App.jsx (cityStableId) -
// if you change the slugify rule here, update it there too, or lookups will mismatch.
function stableId(adm0_a3, name) {
  const slug = name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'unknown';
  return `${adm0_a3}-${slug}`;
}

module.exports = { stableId };
