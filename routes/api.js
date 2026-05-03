const express = require("express");
const router = express.Router();
const { searchCinemeta } = require("../services/imdb");

/* ---------------- AUTO IMDb + TYPE ---------------- */

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
      const existingType = parts[1];
      const existingId = parts[2] || parts[1];

      // already formatted
      if (existingId && existingId.startsWith("tt") && existingType) {
        out.push(`${title} | ${existingType} | ${existingId}`);
        continue;
      }

      const mSeries = await searchCinemeta(title, "series");
      const mMovie = await searchCinemeta(title, "movie");

      let meta = mSeries || mMovie;

      if (meta?.id) {
        const type = mSeries ? "series" : "movie";
        out.push(`${title} | ${type} | ${meta.id}`);
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

/* ---------------- CLASSIFY (NO GUESSING) ---------------- */

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

      const title = parts[0];
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