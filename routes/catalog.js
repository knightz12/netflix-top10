const express = require("express");
const router = express.Router();
const { getWatchlist } = require("../services/watchlist");
const { fetchNetflixTitles, searchCinemeta } = require("../services/imdb");

/* ---------------- CATALOG ---------------- */

router.get("/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  try {
    // ✅ Netflix Movies
    if (type === "movie" && id === "netflix_movies") {
      const titles = await fetchNetflixTitles("movie");
      const metas = [];

      for (const t of titles) {
        const m = await searchCinemeta(t, "movie");

        if (m && m.id) {
          metas.push({
            ...m,
            type: "movie",
          });
        }
      }

      return res.json({ metas });
    }

    // ✅ Netflix Series
    if (type === "series" && id === "netflix_series") {
      const titles = await fetchNetflixTitles("series");
      const metas = [];

      for (const t of titles) {
        const m = await searchCinemeta(t, "series");

        if (m && m.id) {
          metas.push({
            ...m,
            type: "series",
          });
        }
      }

      return res.json({ metas });
    }

    // ✅ Kdrama Movies
    if (type === "movie" && id === "kdrama_movies") {
      const metas = await getWatchlist("movie");

      return res.json({
        metas: metas
          .filter((m) => m && m.id)
          .map((m) => ({
            ...m,
            type: "movie",
          })),
      });
    }

    // ✅ Kdrama Series
    if (type === "series" && id === "kdrama_series") {
      const metas = await getWatchlist("series");

      return res.json({
        metas: metas
          .filter((m) => m && m.id)
          .map((m) => ({
            ...m,
            type: "series",
          })),
      });
    }

    return res.json({ metas: [] });
  } catch (e) {
    console.error("Catalog error:", e);
    return res.json({ metas: [] });
  }
});

module.exports = router;