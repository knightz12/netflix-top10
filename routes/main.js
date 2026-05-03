const express = require("express");
const router = express.Router();
const { readRaw } = require("../services/watchlist");

router.get("/", (req, res) => {
  res.send("<h1>Addon Running</h1><a href='/edit'>Editor</a>");
});

router.get("/edit", (req, res) => {
  res.send(`
    <form method="POST">
      <textarea name="data" style="width:100%;height:70vh">${readRaw()}</textarea>
      <button>Save</button>
    </form>
  `);
});

router.post("/edit", (req, res) => {
  require("fs").writeFileSync(require("../config").WATCHLIST_FILE, req.body.data || "");
  res.redirect("/edit");
});

module.exports = router;
