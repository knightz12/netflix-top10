const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.text());

const WATCHLIST_FILE = path.join(__dirname, "watchlist.txt");

/* ---------------- MANIFEST ---------------- */

const manifest = {
  id: "org.netflix.kdrama.final",
  version: "13.0.0",
  name: "Netflix PH + Kdrama Watchlist",
  resources: ["catalog"],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "netflix_movies",
      name: "Netflix PH Top 10 Movies This Week",
    },
    {
      type: "series",
      id: "netflix_series",
      name: "Netflix PH Top 10 Series This Week",
    },
    {
      type: "movie",
      id: "kdrama_movies",
      name: "Kdrama Watchlist Movies",
    },
    {
      type: "series",
      id: "kdrama_series",
      name: "Kdrama Watchlist Series",
    },
  ],
};

/* ---------------- NETFLIX ---------------- */

async function fetchNetflixTitles() {
  const res = await fetch("https://www.netflix.com/tudum/top10/philippines");
  const html = await res.text();

  const $ = cheerio.load(html);
  const titles = [];

  $("img[alt]").each((_, el) => {
    const t = ($(el).attr("alt") || "").replace("Image:", "").trim();
    if (t && !titles.includes(t)) titles.push(t);
  });

  return titles.slice(0, 10);
}

/* ---------------- CINEMETA ---------------- */

async function searchCinemeta(title, type) {
  try {
    const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(title)}.json`;
    const res = await fetch(url);
    const data = await res.json();
    return data.metas?.[0] || null;
  } catch {
    return null;
  }
}

async function getMetaByImdb(id, type) {
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`);
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

function parseWatchlist() {
  return readRaw()
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split("|").map(p => p.trim());
      return { title: parts[0], imdb: parts[1] || null };
    });
}

async function getWatchlist(type) {
  const items = parseWatchlist();
  const metas = [];

  for (let i = 0; i < items.length; i++) {
    let { title, imdb } = items[i];
    let meta = null;

    if (imdb) {
      meta = await getMetaByImdb(imdb, type);
    }

    if (!meta) meta = await searchCinemeta(title, type);

    if (meta && meta.type === type) {
      metas.push(meta);
    }
  }

  return metas;
}

/* ---------------- ROUTES ---------------- */

app.get("/manifest.json", (req, res) => res.json(manifest));

app.get("/catalog/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  if (id === "netflix_movies") {
    const titles = await fetchNetflixTitles();
    const metas = await Promise.all(titles.map(t => searchCinemeta(t, "movie")));
    return res.json({ metas });
  }

  if (id === "netflix_series") {
    const titles = await fetchNetflixTitles();
    const metas = await Promise.all(titles.map(t => searchCinemeta(t, "series")));
    return res.json({ metas });
  }

  if (id === "kdrama_movies") {
    return res.json({ metas: await getWatchlist("movie") });
  }

  if (id === "kdrama_series") {
    return res.json({ metas: await getWatchlist("series") });
  }

  res.json({ metas: [] });
});

/* ---------------- AUTO IMDb ---------------- */

app.post("/api/imdb", async (req, res) => {
  const lines = req.body.split("\n");
  const out = [];

  for (const line of lines) {
    const t = line.split("|")[0].trim();

    const found =
      (await searchCinemeta(t, "series")) ||
      (await searchCinemeta(t, "movie"));

    if (found?.id) out.push(`${t} | ${found.id}`);
    else out.push(t);
  }

  res.send(out.join("\n"));
});

/* ---------------- EDITOR ---------------- */

app.get("/edit", (req, res) => {
  const content = readRaw();

  res.send(`
<h1>Watchlist Editor</h1>

<button onclick="auto()">Auto IMDb</button>

<form method="POST">
<textarea id="box" name="data" style="width:100%;height:70vh">${content}</textarea>
<br><button>Save</button>
</form>

<script>
async function auto(){
  const res = await fetch('/api/imdb',{method:'POST',body:document.getElementById('box').value});
  document.getElementById('box').value = await res.text();
}
</script>
`);
});

app.post("/edit", (req, res) => {
  fs.writeFileSync(WATCHLIST_FILE, req.body.data || "");
  res.redirect("/edit");
});

/* ---------------- START ---------------- */

app.listen(PORT, () => console.log("Running on port " + PORT));