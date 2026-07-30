const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const getFactsStmt = db.prepare(`
  SELECT fact, source_url FROM facts
  WHERE entity_type = ? AND entity_id = ?
  ORDER BY id
`);

// All facts for a given entity share the same source article, so we just
// take the first row's source_url as the entity's single citation link
function buildResponse(rows) {
  return {
    facts: rows.map((r) => r.fact),
    sourceUrl: rows.length > 0 ? rows[0].source_url : null,
  };
}

app.get('/api/countries/:code/facts', (req, res) => {
  const rows = getFactsStmt.all('country', req.params.code);
  res.json({ country: req.params.code, ...buildResponse(rows) });
});

app.get('/api/regions/:id/facts', (req, res) => {
  const rows = getFactsStmt.all('region', req.params.id);
  res.json({ region: req.params.id, ...buildResponse(rows) });
});

app.get('/api/cities/:id/facts', (req, res) => {
  const rows = getFactsStmt.all('city', req.params.id);
  res.json({ city: req.params.id, ...buildResponse(rows) });
});

app.listen(3001, () => console.log('API running on http://localhost:3001'));