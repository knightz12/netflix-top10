const express = require("express");
const router = express.Router();
const { autoImdb } = require("../services/imdb");

router.post("/imdb", async (req, res) => {
  try {
    const text =
      typeof req.body === "string"
        ? req.body
        : req.body?.watchlist || req.body?.data || "";

    const result = await autoImdb(text);

    res.type("text/plain").send(result);
  } catch (e) {
    console.error("Auto IMDb error:", e);
    res.status(500).send("Auto IMDb failed");
  }
});

module.exports = router;