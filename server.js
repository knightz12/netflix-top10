const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const URLS = {
  movie: "https://www.netflix.com/tudum/top10/philippines",
  series: "https://www.netflix.com/tudum/top10/philippines/tv",
};

const WATCHLIST_FILE = path.join(__dirname, "watchlist.txt");
const CACHE_MS = 6 * 60 * 60 * 1000;

let cache = {
  movie: { time: 0, metas: [] },
  series: { time: 0, metas: [] },
};

const manifest = {
  id: "org.netflix.mdl.combo.editor",
  version: "10.0.0",
  name: "Netflix PH + Watchlist",
  description: "Netflix PH Top 10 + Advanced Watchlist Editor",
  resources: ["catalog"],
  types: ["movie", "series"],
  catalogs: [
    { type: "movie", id: "netflix_ph_top10_movies", name: "Netflix PH Movies" },
    { type: "series", id: "netflix_ph_top10_series", name: "Netflix PH Series" },
    { type: "series", id: "mdl_watchlist", name: "My Watchlist" },
  ],
};

/* ---------------- UTIL ---------------- */

function cleanTitle(title) {
  return String(title || "")
    .replace(/^Image:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanForSearch(title) {
  return String(title || "")
    .replace(/:\s*Season.*$/i, "")
    .replace(/:\s*Limited Series$/i, "")
    .replace(/\(\d{4}\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- NETFLIX ---------------- */

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function extractNetflixTitles(html, type) {
  const $ = cheerio.load(html);
  const titles = [];

  $("img[alt]").each((_, el) => {
    const t = cleanTitle($(el).attr("alt"));
    if (t && !titles.includes(t)) titles.push(t);
  });

  return titles.slice(0, 10);
}

async function fetchNetflix(type) {
  const html = await fetchHtml(URLS[type]);
  return { titles: extractNetflixTitles(html, type) };
}

async function searchCinemeta(title, type) {
  try {
    const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(
      cleanForSearch(title)
    )}.json`;

    const res = await fetch(url);
    const data = await res.json();

    return data.metas?.[0] || null;
  } catch {
    return null;
  }
}

/* ---------------- WATCHLIST ---------------- */

function readWatchlistRaw() {
  if (!fs.existsSync(WATCHLIST_FILE)) fs.writeFileSync(WATCHLIST_FILE, "");
  return fs.readFileSync(WATCHLIST_FILE, "utf-8");
}

function readWatchlist() {
  return readWatchlistRaw()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      return {
        title: parts[0],
        imdbId: parts[1]?.startsWith("tt") ? parts[1] : null,
      };
    });
}

async function getMetaByImdbId(id, type) {
  try {
    const url = `https://v3-cinemeta.strem.io/meta/${type}/${id}.json`;
    const res = await fetch(url);
    const data = await res.json();
    return data.meta || null;
  } catch {
    return null;
  }
}

async function getWatchlistCatalog() {
  const items = readWatchlist();
  const metas = [];

  for (let i = 0; i < items.length; i++) {
    const { title, imdbId } = items[i];

    let found = null;

    if (imdbId) {
      found = await getMetaByImdbId(imdbId, "series");
      if (!found) found = await getMetaByImdbId(imdbId, "movie");
    }

    if (!found) found = await searchCinemeta(title, "series");
    if (!found) found = await searchCinemeta(title, "movie");

    metas.push(
      found
        ? { ...found }
        : { id: "wl" + i, type: "series", name: title }
    );
  }

  return metas;
}

/* ---------------- SORTING ---------------- */

function sortWatchlistLines(content, mode = "recent") {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (mode === "az") {
    return lines.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join("\n");
  }

  if (mode === "type") {
    const movies = [];
    const series = [];
    const unknown = [];

    for (const line of lines) {
      const lower = line.toLowerCase();

      if (lower.includes("| movie |")) movies.push(line);
      else if (lower.includes("| series |")) series.push(line);
      else unknown.push(line);
    }

    return [
      "# Movies",
      ...movies,
      "",
      "# Series",
      ...series,
      "",
      "# IMDb / Unknown",
      ...unknown,
    ].join("\n");
  }

  return lines.reverse().join("\n");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------------- ROUTES ---------------- */

app.get("/manifest.json", (req, res) => res.json(manifest));

app.get("/catalog/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  if (id === "netflix_ph_top10_movies") {
    const { titles } = await fetchNetflix("movie");
    const metas = await Promise.all(titles.map(t => searchCinemeta(t, "movie")));
    return res.json({ metas });
  }

  if (id === "netflix_ph_top10_series") {
    const { titles } = await fetchNetflix("series");
    const metas = await Promise.all(titles.map(t => searchCinemeta(t, "series")));
    return res.json({ metas });
  }

  if (id === "mdl_watchlist") {
    return res.json({ metas: await getWatchlistCatalog() });
  }

  res.json({ metas: [] });
});

/* ---------------- EDITOR ---------------- */

app.get("/edit", (req, res) => {
  const mode = req.query.sort || "recent";
  const content = sortWatchlistLines(readWatchlistRaw(), mode);
  const saved = req.query.saved ? `<p>Saved!</p>` : "";

  res.send(`
<h1>Watchlist Editor</h1>
${saved}

<a href="/edit?sort=recent">Recent</a>
<a href="/edit?sort=type">Movies/Series</a>
<a href="/edit?sort=az">A-Z</a>

<form method="POST">
<textarea name="watchlist" style="width:100%;height:70vh">${escapeHtml(content)}</textarea>
<br><button>Save</button>
</form>
`);
});

app.post("/edit", (req, res) => {
  fs.writeFileSync(WATCHLIST_FILE, req.body.watchlist || "");
  res.redirect("/edit?saved=1");
});

/* ---------------- START ---------------- */

app.listen(PORT, "0.0.0.0", () => {
  console.log("Running on http://localhost:" + PORT);
});