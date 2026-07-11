const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/countries/:code/facts', (req, res) => {
  // MVP: read from data/facts.json, later: query DB
  res.json({ country: req.params.code, facts: [] });
});

app.listen(3001, () => console.log('API running on http://localhost:3001'));