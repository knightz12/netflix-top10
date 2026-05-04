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

      <button type="button" class="secondary" onclick="sortAZ()">A-Z</button>
      <button type="button" class="secondary" onclick="sortRecent()">Recent</button>

      <button type="button" class="blue" onclick="autoIMDb()">Auto IMDb</button>
      <button type="submit" class="green">Save</button>
    </div>

    <textarea id="box" name="data">${escapeHtml(content)}</textarea>
  </form>

  <div class="status" id="status"></div>
</div>

<script>
let allData = document.getElementById("box").value;

function box() {
  return document.getElementById("box");
}

function lines(text) {
  return text.split("\\n").map(x => x.trim()).filter(Boolean);
}

function syncAllData() {
  if (box().value.trim()) {
    allData = box().value;
  }
}

function sortAZ() {
  box().value = lines(box().value)
    .sort((a, b) => a.split("|")[0].trim().localeCompare(b.split("|")[0].trim()))
    .join("\\n");
  allData = box().value;
}

function sortRecent() {
  box().value = lines(box().value).reverse().join("\\n");
  allData = box().value;
}

async function renderTab(tab) {
  if (tab === "all") {
    box().value = allData;
    return;
  }

  const res = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: allData
  });

  const data = await res.json();

  if (tab === "movie") box().value = (data.movie || []).join("\\n");
  if (tab === "series") box().value = (data.series || []).join("\\n");
  if (tab === "unknown") box().value = (data.unknown || []).join("\\n");
}

async function autoIMDb() {
  const status = document.getElementById("status");
  status.innerText = "Finding IMDb...";

  const textToFix = box().value.trim() ? box().value : allData;

  const res = await fetch("/api/imdb", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: textToFix
  });

  allData = await res.text();
  box().value = allData;
  status.innerText = "Done ✔ Click Save";
}

function beforeSave() {
  box().value = allData;
  return true;
}
</script>

</body>
</html>
`);
});

/* ---------------- SAVE ---------------- */

router.post("/edit", async (req, res) => {
  try {
    const content = req.body.data || "";

    const token = process.env.GITHUB_TOKEN;
    const repo = "knightz12/netflix-top10"; // CHANGE if needed
    const path = "watchlist.txt";

    // get current file SHA
    const getFile = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    const fileData = await getFile.json();
    const sha = fileData.sha;

    // update file
    await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          message: "update watchlist",
          content: Buffer.from(content).toString("base64"),
          sha,
        }),
      }
    );

    res.redirect("/edit");
  } catch (e) {
    console.error(e);
    res.send("Failed to save to GitHub");
  }
});

module.exports = router;