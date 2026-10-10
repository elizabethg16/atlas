# Atlas

*Started July 10, 2026*

**What if you could only go places that started with the same letter?**

Atlas is an interactive 3D globe. Pick a letter and every country, first-level region and city that starts with it lights up. Pick several and see where they overlap.

**[Open the live site →](https://elizabethg16.github.io/atlas/)**

## What you can do

- **Pick a letter** from the A–Z index to highlight matching countries, regions and cities.
- **Drill down.** Click a country once to select it and again to open its regions. Cities appear as points you can hover and click, and you can toggle them on or off.
- **Multi mode.** Choose several letters, each with its own color. A region or city that matches one letter and sits in a country matching another is drawn in a blend of the two colors.
- **∩ ONLY.** Show just the places where letters intersect.
- **Read the facts.** Every place has a short list of facts and a link to its source. The panel also shows where the place sits (city, region, country).
- **Have a friend?** Each pick a letter and see where you could meet up.

## How the facts work

The facts are scraped from Wikipedia because I wanted them to be accurate and not sound generated.

1. A scraper downloads the place's Wikipedia article and keeps the sections about modern life (economy, demographics, culture, geography). It skips history and etymology, which otherwise dominate the text.
2. Claude summarizes that text into a handful of short facts. The prompt tells it to use only what the article says.
3. The facts and their source link are saved in a SQLite database.
4. The API reads from that database. Nothing is generated while you click, so facts appear quickly and cost nothing per visit.

The generation scripts delete and re-insert each place's rows, so you can run them again safely after changing the prompt.

## How it's built

```
Browser (GitHub Pages)            API (Render)             Build-time scripts
React + Vite + react-globe.gl --> Express + SQLite  <----  Wikipedia scraper
   GeoJSON map data                 /api/.../facts          + Claude summarizer
```

| Part | Tools |
| --- | --- |
| Frontend | React, Vite, react-globe.gl (Three.js) |
| Backend | Node, Express, better-sqlite3 |
| Fact pipeline | Cheerio, Anthropic SDK |
| Map data | Natural Earth, cleaned by hand in QGIS |
| Hosting | GitHub Pages (frontend), Render (backend) |

The app is rendered in the browser. The server only sends facts as JSON.

## Run it locally

You need Node.js and, to generate new facts, an Anthropic API key.

```bash
git clone https://github.com/elizabethg16/atlas.git
cd atlas
```

**Backend**

```bash
cd backend
npm install
node index.js          # runs on http://localhost:3001
```

**Frontend** (in a second terminal)

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:3001" > .env
npm run dev
```

**Generating facts** (optional, uses API credits)

Put `ANTHROPIC_API_KEY=your-key` in `backend/.env`, then run the scripts in `backend/scripts` from the project root:

```bash
node backend/scripts/generateCountryFacts.js
node backend/scripts/generateRegionFacts.js
node backend/scripts/generateCityFacts.js
```

The database file `backend/facts.db` is committed, so the app works without running any of this.

**Deploying**

- Frontend: `cd frontend && npm run deploy` publishes to GitHub Pages.
- Backend: pushing to `main` redeploys on Render.

## Challenges

- **Messy region data.** Natural Earth's first-level regions were inconsistent across countries: some were missing, and some were nonsense like "Eastern" and "Western". I audited them country by country and rebuilt the dataset in QGIS.
- **Unreliable place IDs.** Many regions share or lack standard codes (all UK regions had the same one). I built stable IDs from country code plus place name, and the frontend and backend must use the same rule.
- **Hallucination risk.** Letting a model recall facts produced vague or wrong results. Grounding every fact in a scraped article fixed that. Early versions also summarized only history because the article's opening dominated the text, so the scraper became section-aware.
- **Free-tier cold starts.** Render's free plan sleeps after 15 minutes idle, and the first request could take a minute or two. A `/health` endpoint pinged every 5 minutes by a monitor keeps it awake.
- **Globe performance.** Thousands of polygons slow the render, so I tuned how much detail the map files keep.

## Data and credits

- Boundaries and city points: [Natural Earth](https://www.naturalearthdata.com/) (public domain)
- Facts: summarized from [Wikipedia](https://www.wikipedia.org/) articles, licensed CC BY-SA. Each fact links to its source.
