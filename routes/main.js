const express = require("express");
const router = express.Router();
const fs = require("fs");
const { WATCHLIST_FILE } = require("../config");
const { readRaw } = require("../services/watchlist");

/* ---------------- MANIFEST ---------------- */

const manifest = {
  id: "org.netflix.kdrama.fixed",
  version: "13.4.0",
  name: "Netflix PH + Kdrama Watchlist",
  description: "Netflix PH Top 10 + Kdrama Watchlist",
  resources: ["catalog"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
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

/* ---------------- EDITOR UI ---------------- */

router.get("/edit", (req, res) => {
  const content = readRaw();

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Watchlist Editor</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      margin: 0;
      background: #0f0f0f;
      color: #fff;
      font-family: Segoe UI, Arial, sans-serif;
    }

    .wrap {
      max-width: 1100px;
      margin: auto;
      padding: 24px;
    }

    h1 {
      margin: 0 0 6px 0;
    }

    .hint {
      font-size: 13px;
      color: #999;
      margin-bottom: 14px;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 10px;
    }

    button {
      background: #e50914;
      border: 0;
      color: white;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    }

    button:hover {
      opacity: 0.9;
    }

    .secondary { background: #333; }
    .green { background: #16a34a; }
    .blue { background: #2563eb; }

    textarea {
      width: 100%;
      height: 65vh;
      background: #0c0c0c;
      border: 1px solid #333;
      border-radius: 10px;
      color: #fff;
      padding: 14px;
      font-family: Consolas, monospace;
      font-size: 14px;
      line-height: 1.45;
      box-sizing: border-box;
    }

    .status {
      margin-top: 10px;
      color: #aaa;
      font-size: 14px;
      min-height: 22px;
    }
  </style>
</head>
<body>

<div class="wrap">
  <h1>Watchlist Editor</h1>
  <div class="hint">Format: Title | tt1234567</div>

  <form method="POST" onsubmit="return beforeSave()">
    <div class="toolbar">
      <button type="button" class="secondary" onclick="renderTab('all')">All</button>
      <button type="button" class="secondary" onclick="renderTab('movie')">Movies</button>
      <button type="button" class="secondary" onclick="renderTab('series')">Series</button>
      <button type="button" class="secondary" onclick="renderTab('unknown')">Unknown</button>

      <button type="button" class="blue" onclick="autoIMDb()">Auto IMDb</button>
      <button type="submit" class="green">Save</button>
    </div>

    <textarea id="box" name="data">${escapeHtml(content)}</textarea>
  </form>

  <div class="status" id="status"></div>
</div>

<script>
let fullData = document.getElementById("box").value;
let currentTab = "all";
let classified = { movie: [], series: [], unknown: [] };

function getBox() {
  return document.getElementById("box");
}

function getVisibleLines() {
  return getBox().value
    .split("\\n")
    .map(l => l.trim())
    .filter(Boolean);
}

function saveCurrentTabToMemory() {
  const lines = getVisibleLines();

  if (currentTab === "movie") classified.movie = lines;
  if (currentTab === "series") classified.series = lines;
  if (currentTab === "unknown") classified.unknown = lines;

  if (currentTab === "all") {
    fullData = getBox().value;
  }
}

function allLines() {
  return [
    ...classified.movie,
    ...classified.series,
    ...classified.unknown
  ];
}

function renderTab(tab) {
  saveCurrentTabToMemory();
  currentTab = tab;

  if (tab === "all") {
    getBox().value = allLines().join("\\n");
  }

  if (tab === "movie") {
    getBox().value = classified.movie.join("\\n");
  }

  if (tab === "series") {
    getBox().value = classified.series.join("\\n");
  }

  if (tab === "unknown") {
    getBox().value = classified.unknown.join("\\n");
  }
}

async function classifyTabs() {
  const status = document.getElementById("status");
  status.innerText = "Detecting movie / series type...";

  try {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: fullData
    });

    classified = await res.json();

    if (!classified.movie) classified.movie = [];
    if (!classified.series) classified.series = [];
    if (!classified.unknown) classified.unknown = [];

    currentTab = "all";
    getBox().value = allLines().join("\\n");

    status.innerText =
      "Detected: " +
      classified.movie.length + " movies, " +
      classified.series.length + " series, " +
      classified.unknown.length + " unknown";
  } catch {
    classified = { movie: [], series: [], unknown: fullData.split("\\n").filter(Boolean) };
    getBox().value = classified.unknown.join("\\n");
    status.innerText = "Type detection failed. Loaded all items as Unknown.";
  }
}

function beforeSave() {
  saveCurrentTabToMemory();

  getBox().value = allLines().join("\\n");

  return true;
}

async function autoIMDb() {
  const box = getBox();
  const status = document.getElementById("status");

  saveCurrentTabToMemory();
  box.value = allLines().join("\\n");

  status.innerText = "Finding IMDb IDs...";

  try {
    const res = await fetch("/api/imdb", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: box.value
    });

    fullData = await res.text();
    box.value = fullData;

    await classifyTabs();

    status.innerText = "Auto IMDb done ✔ Click Save";
  } catch {
    status.innerText = "Auto IMDb failed.";
  }
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