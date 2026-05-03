const express = require("express");
const router = express.Router();
const { getWatchlist } = require("../services/watchlist");
const { fetchNetflixTitles, searchCinemeta } = require("../services/imdb");

/* ---------------- CATALOG ---------------- */

router.get("/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  try {
    // ✅ Netflix Movies
    if (id === "netflix_movies") {
      const titles = await fetchNetflixTitles();
      const metas = [];

      for (const t of titles) {
        const m = await searchCinemeta(t, "movie");
        if (m) metas.push(m);
      }

      return res.json({ metas });
    }

    // ✅ Netflix Series
    if (id === "netflix_series") {
      const titles = await fetchNetflixTitles();
      const metas = [];

      for (const t of titles) {
        const m = await searchCinemeta(t, "series");
        if (m) metas.push(m);
      }

      return res.json({ metas });
    }

    // ✅ Kdrama Movies
    if (id === "kdrama_movies") {
      return res.json({
        metas: await getWatchlist("movie"),
      });
    }

    // ✅ Kdrama Series
    if (id === "kdrama_series") {
      return res.json({
        metas: await getWatchlist("series"),
      });
    }

    return res.json({ metas: [] });
  } catch (e) {
    console.error(e);
    return res.json({ metas: [] });
  }
});

module.exports = router;