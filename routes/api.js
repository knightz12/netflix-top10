const express = require("express");
const router = express.Router();
const { autoImdb, searchCinemeta } = require("../services/imdb");

/* ---------------- AUTO IMDb ---------------- */

router.post("/imdb", async (req, res) => {
  try {
    const text = typeof req.body === "string" ? req.body : "";

    if (!text.trim()) {
      return res
        .status(400)
        .type("text/plain")
        .send("No watchlist text received");
    }

    const result = await autoImdb(text);
    res.type("text/plain").send(result);
  } catch (e) {
    console.error("Auto IMDb error:", e);
    res.status(500).type("text/plain").send("Auto IMDb failed: " + e.message);
  }
});

/* ---------------- SMART TYPE CLASSIFIER ---------------- */

router.post("/classify", async (req, res) => {
  try {
    const text = typeof req.body === "string" ? req.body : "";

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const movie = [];
    const series = [];
    const unknown = [];

    for (const line of lines) {
      if (line.startsWith("#")) continue;

      const parts = line.split("|").map(p => p.trim());
      const title = parts[0];
      const imdbId = parts[1];

      // ✅ 1. If has IMDb → use REAL data
      if (imdbId && imdbId.startsWith("tt")) {
        try {
          const resMovie = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`);
          if (resMovie.ok) {
            movie.push(line);
            continue;
          }

          const resSeries = await fetch(`https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`);
          if (resSeries.ok) {
            series.push(line);
            continue;
          }
        } catch {}
      }

      // ❗ fallback (no imdb or failed)
      try {
        const m = await searchCinemeta(title, "series") || await searchCinemeta(title, "movie");

        if (m?.type === "series") {
          series.push(line);
        } else if (m?.type === "movie") {
          movie.push(line);
        } else {
          unknown.push(line);
        }
      } catch {
        unknown.push(line);
      }
    }

    res.json({ movie, series, unknown });
  } catch (e) {
    console.error("Classify error:", e);
    res.status(500).json({ movie: [], series: [], unknown: [] });
  }
});

module.exports = router;