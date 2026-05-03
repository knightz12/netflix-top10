const fs = require("fs");
const { WATCHLIST_FILE } = require("../config");

function readRaw() {
  if (!fs.existsSync(WATCHLIST_FILE)) fs.writeFileSync(WATCHLIST_FILE, "");
  return fs.readFileSync(WATCHLIST_FILE, "utf-8");
}

function parse() {
  return readRaw().split("\n").filter(Boolean).map(l => {
    const p = l.split("|");
    return { title: p[0].trim(), imdb: p[1]?.trim() };
  });
}

async function getWatchlist(type) {
  const { search } = require("./imdb");
  const items = parse();
  const metas = [];

  for (const item of items) {
    let m = item.imdb ? await search(item.title, type) : await search(item.title, type);
    if (m && m.type === type) metas.push(m);
  }

  return metas;
}

module.exports = { readRaw, getWatchlist };
