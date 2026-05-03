const express = require("express");
const router = express.Router();
const { autoImdb } = require("../services/imdb");

router.post("/imdb", async (req, res) => {
  try {
    const text = typeof req.body === "string" ? req.body : "";

    if (!text.trim()) {
      return res.status(400).type("text/plain").send("No watchlist text received");
    }

    const result = await autoImdb(text);
    res.type("text/plain").send(result);
  } catch (e) {
    console.error("Auto IMDb error:", e);
    res.status(500).type("text/plain").send("Auto IMDb failed: " + e.message);
  }
});

module.exports = router;