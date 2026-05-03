const express = require("express");
const router = express.Router();
const { getWatchlist } = require("../services/watchlist");

router.get("/:type/:id.json", async (req, res) => {
  if (req.params.id === "watchlist") {
    return res.json({ metas: await getWatchlist(req.params.type) });
  }
  res.json({ metas: [] });
});

module.exports = router;
