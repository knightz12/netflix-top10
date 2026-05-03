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

const WATCHLIST_FILE = path.join(__dirname, "watchlist.txt");

const URLS = {
  movie: "https://www.netflix.com/tudum/top10/philippines",
  series: "https://www.netflix.com/tudum/top10/philippines/tv",
};

const manifest = {
  id: "org.netflix.watchlist.advanced",
  version: "10.0.0",
  name: "Netflix PH + Watchlist",
  description: "Netflix PH Top 10 + Advanced Watchlist Editor",
  resources: ["catalog"],
  types: ["movie", "series"],
  catalogs: [
    { type: "movie", id: "netflix_movies", name: "Netflix PH Movies" },
    { type: "series", id: "netflix_series", name: "Netflix PH Series" },
    { type: "series", id: "watchlist", name: "My Watchlist" },
  ],
};

function cleanTitle(t) {
  return String(t || "").replace(/^Image:\s*/i, "").trim();
}

function cleanSearch(t) {
  return t.replace(/\(\d{4}\)/g, "").trim();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return await res.text();
}

function extractTitles(html) {
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
  return extractTitles(html);
}

async function searchCinemeta(title, type) {
  try {
    const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(
      cleanSearch(title)
    )}.json`;

    const res = await fetch(url);
    const data = await res.json();
    return data.metas?.[0] || null;
  } catch {
    return null;
  }
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

/* ---------------- WATCHLIST ---------------- */

function readRaw() {
  if (!fs.existsSync(WATCHLIST_FILE)) fs.writeFileSync(WATCHLIST_FILE, "");
  return fs.readFileSync(WATCHLIST_FILE, "utf-8");
}

function readParsed() {
  return readRaw()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const p = l.split("|").map((x) => x.trim());
      return { title: p[0], imdb: p[1] || null };
    });
}

async function getWatchlist() {
  const items = readParsed();
  const metas = [];

  for (let i = 0; i < items.length; i++) {
    const { title, imdb } = items[i];

    let meta = null;

    if (imdb) {
      meta = await getMetaByImdbId(imdb, "series");
      if (!meta) meta = await getMetaByImdbId(imdb, "movie");
    }

    if (!meta) meta = await searchCinemeta(title, "series");
    if (!meta) meta = await searchCinemeta(title, "movie");

    metas.push(
      meta
        ? { ...meta }
        : { id: "wl" + i, type: "series", name: title }
    );
  }

  return metas;
}

/* ---------------- SORTING ---------------- */

function sortLines(content, mode) {
  let lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (mode === "az") {
    lines.sort((a, b) => a.localeCompare(b));
  } else if (mode === "type") {
    const movies = [];
    const series = [];

    lines.forEach((l) => {
      l.toLowerCase().includes("movie")
        ? movies.push(l)
        : series.push(l);
    });

    lines = ["# Movies", ...movies, "", "# Series", ...series];
  } else {
    lines = lines.reverse();
  }

  return lines.join("\n");
}

/* ---------------- ROUTES ---------------- */

app.get("/manifest.json", (req, res) => res.json(manifest));

app.get("/catalog/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  if (id === "netflix_movies")
    return res.json({
      metas: await Promise.all(
        (await fetchNetflix("movie")).map((t) =>
          searchCinemeta(t, "movie")
        )
      ),
    });

  if (id === "netflix_series")
    return res.json({
      metas: await Promise.all(
        (await fetchNetflix("series")).map((t) =>
          searchCinemeta(t, "series")
        )
      ),
    });

  if (id === "watchlist")
    return res.json({ metas: await getWatchlist() });

  res.json({ metas: [] });
});

/* ---------------- EDITOR ---------------- */

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

app.get("/edit", (req, res) => {
  const mode = req.query.sort || "recent";
  const content = sortLines(readRaw(), mode);

  res.send(`
<h1>Watchlist Editor</h1>

<a href="/edit?sort=recent">Recent</a>
<a href="/edit?sort=az">A-Z</a>
<a href="/edit?sort=type">Movies/Series</a>

<form method="POST">
<textarea name="data" style="width:100%;height:70vh">${esc(content)}</textarea>
<br><button>Save</button>
</form>
`);
});

app.post("/edit", (req, res) => {
  fs.writeFileSync(WATCHLIST_FILE, req.body.data);
  res.redirect("/edit");
});

/* ---------------- START ---------------- */

app.listen(PORT, () =>
  console.log("Running on http://localhost:" + PORT)
);