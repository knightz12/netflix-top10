const express = require("express");
const router = express.Router();
const fs = require("fs");
const { WATCHLIST_FILE } = require("../config");
const { readRaw } = require("../services/watchlist");

/* ---------------- MANIFEST ---------------- */

const manifest = {
  id: "org.netflix.kdrama.fixed",
  version: "13.3.0",
  name: "Netflix PH + Kdrama Watchlist",
  description: "Netflix PH Top 10 + Kdrama Watchlist",
  resources: ["catalog"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [
    { type: "movie", id: "netflix_movies", name: "Netflix PH Top 10 Movies This Week" },
    { type: "series", id: "netflix_series", name: "Netflix PH Top 10 Series This Week" },
    { type: "movie", id: "kdrama_movies", name: "Kdrama Watchlist Movies" },
    { type: "series", id: "kdrama_series", name: "Kdrama Watchlist Series" },
  ],
};

/* ---------------- HELPERS ---------------- */

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------------- ROUTES ---------------- */

router.get("/", (req, res) => {
  res.send(`
    <h1>Addon Running</h1>
    <p><a href="/manifest.json">Manifest</a></p>
    <p><a href="/edit">Editor</a></p>
  `);
});

router.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

/* ---------------- EDITOR WITH TABS ---------------- */

router.get("/edit", (req, res) => {
  const content = readRaw();

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Watchlist Editor</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin:0; background:#0f0f0f; color:#fff; font-family:Segoe UI; }
    .wrap { max-width:1100px; margin:auto; padding:24px; }
    h1 { margin-bottom:10px; }

    .tabs {
      display:flex;
      gap:10px;
      margin-bottom:10px;
    }

    .tab {
      padding:10px 16px;
      background:#222;
      border-radius:8px;
      cursor:pointer;
    }

    .active { background:#e50914; }

    textarea {
      width:100%;
      height:65vh;
      background:#0c0c0c;
      border:1px solid #333;
      border-radius:10px;
      color:#fff;
      padding:14px;
      font-family:Consolas;
    }

    button {
      margin-top:10px;
      background:#16a34a;
      border:0;
      padding:10px 14px;
      color:white;
      border-radius:8px;
    }
  </style>
</head>
<body>

<div class="wrap">
  <h1>Watchlist Editor</h1>

  <div class="toolbar">
  <button type="button" class="secondary" onclick="renderTab('all')">All</button>
  <button type="button" class="secondary" onclick="renderTab('movie')">Movies</button>
  <button type="button" class="secondary" onclick="renderTab('series')">Series</button>
  <button type="button" class="secondary" onclick="renderTab('unknown')">Unknown</button>

  <button type="button" class="blue" onclick="autoIMDb()">Auto IMDb</button>
  <button type="submit" class="green">Save</button>
  </div>

  <form method="POST" onsubmit="return beforeSave()">
  <textarea id="box" name="data">${escapeHtml(content)}</textarea>
  </form>
</div>

<script>
let fullData = document.getElementById("box").value;
let currentTab = "all";
let classified = { movie: [], series: [], unknown: [] };

function getBox() {
  return document.getElementById("box");
}

function saveCurrentTabToMemory() {
  const lines = getBox().value.split("\\n").map(l => l.trim()).filter(Boolean);

  if (currentTab === "movie") classified.movie = lines;
  if (currentTab === "series") classified.series = lines;
  if (currentTab === "unknown") classified.unknown = lines;

  if (currentTab === "all") {
    fullData = getBox().value;
  }
}

function renderTab(tab) {
  saveCurrentTabToMemory();
  currentTab = tab;

  if (tab === "all") {
    getBox().value = [
      ...classified.movie,
      ...classified.series,
      ...classified.unknown
    ].join("\\n");
  }

  if (tab === "movie") getBox().value = classified.movie.join("\\n");
  if (tab === "series") getBox().value = classified.series.join("\\n");
  if (tab === "unknown") getBox().value = classified.unknown.join("\\n");
}

async function classifyTabs() {
  const status = document.getElementById("status");
  status.innerText = "Detecting movie/series type...";

  const res = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: fullData
  });

  classified = await res.json();
  renderTab("all");

  status.innerText =
    "Detected: " +
    classified.movie.length + " movies, " +
    classified.series.length + " series, " +
    classified.unknown.length + " unknown";
}

function beforeSave() {
  saveCurrentTabToMemory();

  getBox().value = [
    ...classified.movie,
    ...classified.series,
    ...classified.unknown
  ].join("\\n");

  return true;
}

async function autoIMDb() {
  saveCurrentTabToMemory();

  const box = getBox();
  const status = document.getElementById("status");

  box.value = [
    ...classified.movie,
    ...classified.series,
    ...classified.unknown
  ].join("\\n");

  status.innerText = "Finding IMDb...";

  const res = await fetch("/api/imdb", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: box.value
  });

  fullData = await res.text();
  box.value = fullData;

  await classifyTabs();

  status.innerText = "Done ✔ Click Save";
}

classifyTabs();
</script>

</body>
</html>
`);
});

/* ---------------- SAVE ---------------- */

router.post("/edit", (req, res) => {
  fs.writeFileSync(WATCHLIST_FILE, req.body.data || "");
  res.redirect("/edit");
});

module.exports = router;