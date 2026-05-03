const express = require("express");
const router = express.Router();
const { autoImdb } = require("../services/imdb");

router.post("/imdb", async (req, res) => {
  res.send(await autoImdb(req.body));
});

module.exports = router;
