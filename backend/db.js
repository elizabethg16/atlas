const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'facts.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('country', 'region', 'city')),
    entity_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    fact TEXT NOT NULL,
    source_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_facts_entity ON facts(entity_type, entity_id);
`);

module.exports = db;
