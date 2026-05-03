const express = require("express");
const router = express.Router();
const fs = require("fs");
const { WATCHLIST_FILE } = require("../config");
const { readRaw } = require("../services/watchlist");

/* ---------------- MANIFEST ---------------- */

const manifest = {
  id: "org.netflix.kdrama.fixed",
  version: "13.2.1",
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

/* ---------------- ROUTES ---------------- */

// Home
router.get("/", (req, res) => {
  res.send(`
    <h1>Addon Running</h1>
    <p><a href="/manifest.json">Manifest</a></p>
    <p><a href="/edit">Editor</a></p>
  `);
});

// Manifest
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
    body { margin:0; background:#0f0f0f; color:#fff; font-family:Segoe UI; }
    .wrap { max-width:1100px; margin:auto; padding:24px; }
    h1 { margin-bottom:10px; }

    .toolbar {
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin-bottom:10px;
    }

    input {
      flex:1;
      min-width:200px;
      padding:10px;
      background:#1a1a1a;
      border:1px solid #333;
      border-radius:8px;
      color:white;
    }

    button {
      background:#e50914;
      border:0;
      color:white;
      padding:10px 14px;
      border-radius:8px;
      cursor:pointer;
    }

    .secondary { background:#333; }
    .green { background:#16a34a; }
    .blue { background:#2563eb; }

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

    .status { margin-top:10px; color:#aaa; }
    .hint { font-size:13px; color:#888; margin-bottom:10px; }
  </style>
</head>
<body>

<div class="wrap">
  <h1>Watchlist Editor</h1>
  <div class="hint">Format: Title | tt1234567</div>

  <form method="POST">
    <div class="toolbar">
      <input id="search" placeholder="Search..." oninput="filter()">

      <button type="button" class="secondary" onclick="sortRecent()">Recent</button>
      <button type="button" class="secondary" onclick="sortAZ()">A-Z</button>
      <button type="button" class="secondary" onclick="groupIMDb()">Group IMDb</button>

      <button type="button" class="blue" onclick="autoIMDb()">Auto IMDb</button>
      <button type="submit" class="green">Save</button>
    </div>

    <textarea id="box" name="data">${content}</textarea>
  </form>

  <div class="status" id="status"></div>
</div>

<script>
let original = document.getElementById("box").value;

/* -------- FILTER -------- */
function filter() {
  const q = document.getElementById("search").value.toLowerCase();
  const box = document.getElementById("box");

  if (!q) return box.value = original;

  box.value = original.split("\\n")
    .filter(l => l.toLowerCase().includes(q))
    .join("\\n");
}

/* -------- SORT -------- */
function sortAZ() {
  const lines = original.split("\\n").filter(Boolean);
  lines.sort((a,b)=>a.localeCompare(b));
  update(lines);
}

function sortRecent() {
  const lines = original.split("\\n").filter(Boolean).reverse();
  update(lines);
}

function groupIMDb() {
  const lines = original.split("\\n").filter(Boolean);
  const withId = [];
  const noId = [];

  for (const l of lines) {
    l.includes("tt") ? withId.push(l) : noId.push(l);
  }

  update(["# IMDb Matched", ...withId, "", "# Missing IMDb", ...noId]);
}

function update(lines){
  const box = document.getElementById("box");
  box.value = lines.join("\\n");
  original = box.value;
}

/* -------- AUTO IMDb FIXED -------- */
async function autoIMDb() {
  const box = document.getElementById("box");
  const status = document.getElementById("status");

  status.innerText = "Finding IMDb...";

  try {
    const res = await fetch('/api/imdb', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: box.value
    });

    const text = await res.text();
    box.value = text;
    original = text;

    status.innerText = "Done ✔ (Click Save)";
  } catch {
    status.innerText = "Error ❌";
  }
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