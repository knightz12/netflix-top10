const express = require("express");
const router = express.Router();
const { searchCinemeta } = require("../services/imdb");

/* ---------------- AUTO IMDb + TYPE (FIXED) ---------------- */

router.post("/imdb", async (req, res) => {
  try {
    const text = typeof req.body === "string" ? req.body : "";
    const lines = text.split(/\r?\n/);

    const out = [];

    for (const l of lines) {
      const line = l.trim();

      if (!line) {
        out.push("");
        continue;
      }

      if (line.startsWith("#")) {
        out.push(line);
        continue;
      }

      const parts = line.split("|").map(p => p.trim());
      const title = parts[0];

      const types = parts.filter(p => p === "movie" || p === "series");
      const imdbIds = parts.filter(p => p.startsWith("tt"));

      // ✅ only keep if EXACTLY correct format
      if (types.length === 1 && imdbIds.length === 1) {
        out.push(`${title} | ${types[0]} | ${imdbIds[0]}`);
        continue;
      }

      // 🔥 FIX broken lines (force rebuild)
      const mSeries = await searchCinemeta(title, "series");
      const mMovie = await searchCinemeta(title, "movie");

      if (mSeries?.id) {
        out.push(`${title} | series | ${mSeries.id}`);
      } else if (mMovie?.id) {
        out.push(`${title} | movie | ${mMovie.id}`);
      } else {
        out.push(title);
      }
    }

    res.type("text/plain").send(out.join("\n"));
  } catch (e) {
    console.error(e);
    res.status(500).send("Auto IMDb failed");
  }
});

/* ---------------- CLASSIFY (TYPE BASED) ---------------- */

router.post("/classify", async (req, res) => {
  try {
    const text = typeof req.body === "string" ? req.body : "";

    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const movie = [];
    const series = [];
    const unknown = [];

    for (const line of lines) {
      if (line.startsWith("#")) continue;

      const parts = line.split("|").map(p => p.trim());

      const type = parts[1];

      if (type === "movie") movie.push(line);
      else if (type === "series") series.push(line);
      else unknown.push(line);
    }

    res.json({ movie, series, unknown });
  } catch (e) {
    console.error(e);
    res.status(500).json({ movie: [], series: [], unknown: [] });
  }
});

module.exports = router;