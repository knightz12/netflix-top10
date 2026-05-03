const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.text({ limit: "5mb" }));

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
  id: "org.netflix.mdl.combo.editor.imdb",
  version: "11.0.0",
  name: "Netflix PH + Watchlist",
  description: "Netflix PH Top 10 + editable watchlist with auto IMDb finder",
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

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------------- NETFLIX ---------------- */

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
  return { titles: extractNetflixTitles(html, type) };
}

/* ---------------- CINEMETA ---------------- */

async function searchCinemeta(title, type) {
  try {
    const clean = cleanForSearch(title);

    const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(
      clean
    )}.json`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const metas = (data.metas || []).filter(
      (m) => m && m.id && m.id.startsWith("tt")
    );

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

async function getMetaByImdbId(imdbId, type) {
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

async function autoFindImdb(title) {
  let found = await searchCinemeta(title, "series");
  if (!found) found = await searchCinemeta(title, "movie");

  if (found && found.id && found.id.startsWith("tt")) {
    return {
      title,
      imdbId: found.id,
      name: found.name || title,
      type: found.type || "series",
    };
  }

  return {
    title,
    imdbId: null,
    name: title,
    type: "series",
  };
}

/* ---------------- WATCHLIST FILE ---------------- */

function readWatchlistRaw() {
  try {
    if (!fs.existsSync(WATCHLIST_FILE)) {
      fs.writeFileSync(WATCHLIST_FILE, "", "utf-8");
    }

    return fs.readFileSync(WATCHLIST_FILE, "utf-8");
  } catch {
    return "";
  }
}

function readWatchlist() {
  return readWatchlistRaw()
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
}

function sortWatchlistLines(content, mode = "recent") {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (mode === "az") {
    return lines
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .join("\n");
  }

  if (mode === "type") {
    const imdb = [];
    const plain = [];

    for (const line of lines) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts[1] && parts[1].startsWith("tt")) imdb.push(line);
      else plain.push(line);
    }

    return [
      "# IMDb Matched",
      ...imdb.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      "",
      "# Needs IMDb",
      ...plain.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    ].join("\n");
  }

  return lines.reverse().join("\n");
}

/* ---------------- CATALOGS ---------------- */

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
        if (!found) found = await getMetaByImdbId(imdbId, "movie");
      }

      if (!found) found = await searchCinemeta(title, "series");
      if (!found) found = await searchCinemeta(title, "movie");

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
    } catch {
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

/* ---------------- ROUTES ---------------- */

app.get("/", (req, res) => {
  res.send(`
    <h2>Netflix PH + Watchlist addon running</h2>
    <p><a href="/manifest.json">Manifest</a></p>
    <p><a href="/edit">Edit Watchlist</a></p>
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
  const items = readWatchlist();
  res.json({
    file: "watchlist.txt",
    count: items.length,
    items,
  });
});

/* ---------------- AUTO IMDb API ---------------- */

app.post("/api/resolve-imdb", async (req, res) => {
  try {
    const content = String(req.body.watchlist || "");
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const output = [];
    const results = [];

    for (const line of lines) {
      if (line.startsWith("#")) {
        output.push(line);
        continue;
      }

      const parts = line.split("|").map((p) => p.trim());
      const title = parts[0];
      const existingImdb = parts[1];

      if (existingImdb && existingImdb.startsWith("tt")) {
        output.push(`${title} | ${existingImdb}`);
        results.push({ title, imdbId: existingImdb, status: "kept" });
        continue;
      }

      const resolved = await autoFindImdb(title);

      if (resolved.imdbId) {
        output.push(`${title} | ${resolved.imdbId}`);
        results.push({
          title,
          imdbId: resolved.imdbId,
          matchedName: resolved.name,
          status: "found",
        });
      } else {
        output.push(title);
        results.push({ title, imdbId: null, status: "missing" });
      }
    }

    res.json({
      ok: true,
      watchlist: output.join("\n"),
      results,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});

/* ---------------- EDITOR UI ---------------- */

app.get("/edit", (req, res) => {
  const mode = req.query.sort || "recent";
  const content = sortWatchlistLines(readWatchlistRaw(), mode);
  const saved = req.query.saved ? `<div class="saved">Saved successfully.</div>` : "";

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Watchlist Editor</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #0f0f0f;
      color: #fff;
      font-family: Arial, sans-serif;
    }
    .wrap {
      max-width: 1200px;
      margin: auto;
      padding: 24px;
    }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
    }
    .sub {
      color: #aaa;
      margin-top: 6px;
      font-size: 14px;
    }
    .card {
      background: #181818;
      border: 1px solid #2a2a2a;
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.25);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
      align-items: center;
    }
    button, .btn {
      background: #e50914;
      color: white;
      border: 0;
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      text-decoration: none;
      display: inline-block;
    }
    button:hover, .btn:hover {
      opacity: .9;
    }
    .secondary {
      background: #2c2c2c;
    }
    .green {
      background: #16883a;
    }
    .blue {
      background: #2563eb;
    }
    input {
      flex: 1;
      min-width: 220px;
      background: #0f0f0f;
      color: white;
      border: 1px solid #333;
      border-radius: 10px;
      padding: 11px 12px;
      font-size: 14px;
    }
    textarea {
      width: 100%;
      height: 68vh;
      background: #0c0c0c;
      color: #f5f5f5;
      border: 1px solid #333;
      border-radius: 14px;
      padding: 16px;
      font-size: 15px;
      line-height: 1.55;
      resize: vertical;
      outline: none;
      font-family: Consolas, monospace;
      white-space: pre;
    }
    .saved {
      background: #123f20;
      color: #9cffad;
      border: 1px solid #1f7a39;
      padding: 10px 14px;
      border-radius: 10px;
      margin-bottom: 12px;
    }
    .status {
      color: #bbb;
      font-size: 14px;
      margin-top: 10px;
      min-height: 20px;
    }
    .links {
      margin-top: 14px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .hint {
      color: #aaa;
      font-size: 13px;
      margin-bottom: 12px;
    }
    code {
      background: #282828;
      padding: 2px 6px;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <h1>Watchlist Editor</h1>
        <div class="sub">Edit watchlist.txt directly from browser. Format: <code>Title | ttIMDbID</code></div>
      </div>
    </div>

    ${saved}

    <div class="card">
      <form method="POST" action="/edit" id="watchForm">
        <div class="toolbar">
          <input id="filterBox" placeholder="Search/filter titles..." oninput="filterText()">

          <a class="btn secondary" href="/edit?sort=recent">Recently Added First</a>
          <a class="btn secondary" href="/edit?sort=type">IMDb / Needs IMDb</a>
          <a class="btn secondary" href="/edit?sort=az">A-Z</a>

          <button type="button" class="blue" onclick="autoImdb()">Auto IMDb Finder</button>
          <button type="submit" class="green">Save</button>
        </div>

        <div class="hint">
          Auto IMDb will keep existing <code>tt</code> IDs and fill missing ones using Cinemeta.
        </div>

        <textarea id="watchlist" name="watchlist">${escapeHtml(content)}</textarea>
      </form>

      <div class="status" id="status"></div>

      <div class="links">
        <a class="btn secondary" href="/debug/watchlist">Debug Watchlist</a>
        <a class="btn secondary" href="/catalog/series/mdl_watchlist.json">Catalog JSON</a>
        <a class="btn secondary" href="/manifest.json">Manifest</a>
      </div>
    </div>
  </div>

<script>
let originalText = document.getElementById("watchlist").value;

function filterText() {
  const q = document.getElementById("filterBox").value.toLowerCase().trim();
  const box = document.getElementById("watchlist");

  if (!q) {
    box.value = originalText;
    return;
  }

  box.value = originalText
    .split(/\\r?\\n/)
    .filter(line => line.toLowerCase().includes(q))
    .join("\\n");
}

async function autoImdb() {
  const box = document.getElementById("watchlist");
  const status = document.getElementById("status");

  status.textContent = "Finding IMDb IDs... please wait.";
  
  try {
    const res = await fetch("/api/resolve-imdb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchlist: box.value })
    });

    const data = await res.json();

    if (!data.ok) {
      status.textContent = "Auto IMDb failed: " + data.error;
      return;
    }

    box.value = data.watchlist;
    originalText = data.watchlist;

    const found = data.results.filter(r => r.status === "found").length;
    const kept = data.results.filter(r => r.status === "kept").length;
    const missing = data.results.filter(r => r.status === "missing").length;

    status.textContent = "Done. Found: " + found + " | Kept: " + kept + " | Missing: " + missing + ". Click Save to store changes.";
  } catch (e) {
    status.textContent = "Auto IMDb failed.";
  }
}
</script>
</body>
</html>
`);
});

app.post("/edit", (req, res) => {
  const content = req.body.watchlist || "";
  fs.writeFileSync(WATCHLIST_FILE, content.trim() + "\n", "utf-8");
  res.redirect("/edit?saved=1");
});

/* ---------------- START ---------------- */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Running: http://localhost:${PORT}/manifest.json`);
});