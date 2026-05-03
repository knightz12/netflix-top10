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

  <div class="tabs">
    <div class="tab active" onclick="switchTab('all')">All</div>
    <div class="tab" onclick="switchTab('movies')">Movies</div>
    <div class="tab" onclick="switchTab('series')">Series</div>
  </div>

  <form method="POST">
    <textarea id="box" name="data">${escapeHtml(content)}</textarea>
    <br>
    <button>Save</button>
  </form>
</div>

<script>
let fullData = document.getElementById("box").value;

function switchTab(type) {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(t => t.classList.remove("active"));
  event.target.classList.add("active");

  const lines = fullData.split("\\n").filter(Boolean);

  if (type === "all") {
    document.getElementById("box").value = fullData;
    return;
  }

  const filtered = [];

  for (const l of lines) {
    if (!l.includes("tt")) continue;

    if (type === "movies" && l.includes("| tt")) {
      filtered.push(l);
    }

    if (type === "series" && l.includes("| tt")) {
      filtered.push(l);
    }
  }

  document.getElementById("box").value = filtered.join("\\n");
}
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