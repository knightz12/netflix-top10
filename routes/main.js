const express = require("express");
const router = express.Router();
const fs = require("fs");
const { WATCHLIST_FILE } = require("../config");
const { readRaw } = require("../services/watchlist");

/* ---------------- MANIFEST ---------------- */

const manifest = {
  id: "org.netflix.kdrama.fixed",
  version: "13.1.1",
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

/* ---------------- ROUTES ---------------- */

// Homepage
router.get("/", (req, res) => {
  res.send(`
    <h1>Addon Running</h1>
    <p><a href="/manifest.json">Manifest</a></p>
    <p><a href="/edit">Editor</a></p>
  `);
});

// 🔥 IMPORTANT: Manifest route (this fixes your error)
router.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

// Editor page
router.get("/edit", (req, res) => {
  res.send(`
    <form method="POST">
      <textarea name="data" style="width:100%;height:70vh">${readRaw()}</textarea>
      <br>
      <button>Save</button>
    </form>
  `);
});

// Save watchlist
router.post("/edit", (req, res) => {
  fs.writeFileSync(WATCHLIST_FILE, req.body.data || "");
  res.redirect("/edit");
});

module.exports = router;