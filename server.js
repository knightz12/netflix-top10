const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

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
  id: "org.netflix.mdl.combo.clean",
  version: "8.0.0",
  name: "Netflix PH + Watchlist",
  description: "Netflix PH Top 10 + manual watchlist.txt catalog",
  resources: ["catalog"],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "netflix_ph_top10_movies",
      name: "Netflix PH Top 10 Movies",
    },
    {
      type: "series",
      id: "netflix_ph_top10_series",
      name: "Netflix PH Top 10 Series",
    },
    {
      type: "series",
      id: "mdl_watchlist",
      name: "My Watchlist",
    },
  ],
};

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

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.text();
}

function extractNetflixTitles(html, type) {
  const $ = cheerio.load(html);

  const sectionTitle =
    type === "movie"
      ? "Top 10 Movies in Philippines"
      : "Top 10 Shows in Philippines";

  const overviewTitle =
    type === "movie"
      ? "Top 10 Movies in Philippines overview"
      : "Top 10 Shows in Philippines overview";

  let start = html.indexOf(sectionTitle);
  let end = html.indexOf(overviewTitle);

  if (start === -1) start = 0;
  if (end === -1 || end < start) end = html.length;

  const sectionHtml = html.slice(start, end);
  const $$ = cheerio.load(sectionHtml);

  const titles = [];

  $$("img[alt]").each((_, img) => {
    const alt = cleanTitle($$(img).attr("alt"));

    if (
      alt &&
      !alt.toLowerCase().includes("netflix") &&
      !titles.includes(alt)
    ) {
      titles.push(alt);
    }
  });

  const rawAltRegex = /alt=["']Image:\s*([^"']+)["']/gi;
  let m;

  while ((m = rawAltRegex.exec(sectionHtml)) !== null) {
    const title = cleanTitle(m[1]);
    if (title && !titles.includes(title)) titles.push(title);
  }

  if (titles.length < 10) {
    const text = $("body").text().replace(/\s+/g, " ");
    const overviewStart = text.indexOf(overviewTitle);
    const catchStart = text.indexOf("Catch the Latest", overviewStart);

    let block =
      overviewStart !== -1
        ? text.slice(overviewStart, catchStart !== -1 ? catchStart : undefined)
        : text;

    const regex =
      /\b(01|02|03|04|05|06|07|08|09|10)\s*(?:Image)?\s*(.+?)\s+\d+(?=\s*(01|02|03|04|05|06|07|08|09|10)\s*(?:Image)?|$)/g;

    let match;
    while ((match = regex.exec(block)) !== null) {
      const title = cleanTitle(match[2]);
      if (title && !titles.includes(title)) titles.push(title);
    }
  }

  return titles.slice(0, 10);
}

async function fetchNetflix(type) {
  const html = await fetchHtml(URLS[type]);

  return {
    titles: extractNetflixTitles(html, type),
  };
}

function readWatchlist() {
  try {
    if (!fs.existsSync(WATCHLIST_FILE)) {
      fs.writeFileSync(WATCHLIST_FILE, "", "utf-8");
      return [];
    }

    return fs
      .readFileSync(WATCHLIST_FILE, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const parts = line.split("|").map((p) => p.trim());

        return {
          title: parts[0],
          imdbId: parts[1] && parts[1].startsWith("tt") ? parts[1] : null,
        };
      });
  } catch (e) {
    console.error("watchlist.txt read error:", e.message);
    return [];
  }
}

async function getMetaByImdbId(imdbId, type = "series") {
  try {
    const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    return data.meta || null;
  } catch {
    return null;
  }
}

async function searchCinemeta(title, type) {
  try {
    const clean = cleanForSearch(title);

    const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(
      clean
    )}.json`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const metas = data.metas || [];

    if (!metas.length) return null;

    const exact = metas.find(
      (m) => m.name && m.name.toLowerCase().trim() === clean.toLowerCase()
    );

    const contains = metas.find(
      (m) => m.name && m.name.toLowerCase().includes(clean.toLowerCase())
    );

    return exact || contains || metas[0];
  } catch {
    return null;
  }
}

async function getNetflixCatalog(type) {
  const now = Date.now();

  if (cache[type].metas.length && now - cache[type].time < CACHE_MS) {
    return cache[type].metas;
  }

  const { titles } = await fetchNetflix(type);
  const metas = [];

  for (let i = 0; i < titles.length; i++) {
    const rank = i + 1;
    const title = titles[i];

    const found = await searchCinemeta(title, type);

    if (found && found.id) {
      metas.push({
        ...found,
        type,
        name: found.name,
        description: found.description || "Netflix Philippines Top 10",
      });
    } else {
      metas.push({
        id: `netflix-ph-${type}-${rank}-${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
        type,
        name: title,
        poster: "",
        description: "Netflix Philippines Top 10",
      });
    }
  }

  cache[type] = { time: now, metas };
  return metas;
}

async function getWatchlistCatalog() {
  const items = readWatchlist();
  const metas = [];

  for (let i = 0; i < items.length; i++) {
    const { title, imdbId } = items[i];

    try {
      let found = null;

      if (imdbId) {
        found = await getMetaByImdbId(imdbId, "series");

        if (!found) {
          found = await getMetaByImdbId(imdbId, "movie");
        }
      }

      if (!found) {
        found = await searchCinemeta(title, "series");
      }

      if (!found) {
        found = await searchCinemeta(title, "movie");
      }

      if (found && found.id) {
        metas.push({
          ...found,
          type: found.type || "series",
          name: found.name,
          description: found.description || "From watchlist.txt",
        });
      } else {
        metas.push({
          id: `watchlist-${i + 1}`,
          type: "series",
          name: title,
          poster: "",
          description: "From watchlist.txt",
        });
      }
    } catch (e) {
      metas.push({
        id: `watchlist-${i + 1}`,
        type: "series",
        name: title,
        poster: "",
        description: "From watchlist.txt",
      });
    }
  }

  return metas;
}

app.get("/", (req, res) => {
  res.send(`
    <h2>Netflix PH + Watchlist addon running</h2>
    <p><a href="/manifest.json">Manifest</a></p>
    <p><a href="/debug/watchlist">Watchlist Debug</a></p>
    <p><a href="/catalog/series/mdl_watchlist.json">Watchlist Catalog</a></p>
    <p><a href="/debug/netflix/movie">Netflix Movie Debug</a></p>
    <p><a href="/debug/netflix/series">Netflix Series Debug</a></p>
  `);
});

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

app.get("/catalog/:type/:id.json", async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type === "movie" && id === "netflix_ph_top10_movies") {
      return res.json({ metas: await getNetflixCatalog("movie") });
    }

    if (type === "series" && id === "netflix_ph_top10_series") {
      return res.json({ metas: await getNetflixCatalog("series") });
    }

    if (type === "series" && id === "mdl_watchlist") {
      return res.json({ metas: await getWatchlistCatalog() });
    }

    return res.json({ metas: [] });
  } catch (err) {
    console.error(err);
    return res.json({ metas: [] });
  }
});

app.get("/debug/netflix/:type", async (req, res) => {
  const type = req.params.type === "series" ? "series" : "movie";
  const data = await fetchNetflix(type);
  res.json(data);
});

app.get("/debug/watchlist", (req, res) => {
  const titles = readWatchlist();
  res.json({
    file: "watchlist.txt",
    count: titles.length,
    titles,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Running: http://localhost:${PORT}/manifest.json`);
});