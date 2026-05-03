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

      const title = line.split("|")[0].trim();

      let mMovie = null;
      let mSeries = null;

      try {
        mMovie = await searchCinemeta(title, "movie");
        mSeries = await searchCinemeta(title, "series");
      } catch {}

      if (mMovie && !mSeries) {
        movie.push(line);
      } else if (mSeries && !mMovie) {
        series.push(line);
      } else if (mMovie && mSeries) {
        // Prefer series (most Kdrama)
        series.push(line);
      } else {
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