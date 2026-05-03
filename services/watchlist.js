const fs = require("fs");
const { WATCHLIST_FILE } = require("../config");

function readRaw() {
  if (!fs.existsSync(WATCHLIST_FILE)) {
    fs.writeFileSync(WATCHLIST_FILE, "", "utf-8");
  }

  return fs.readFileSync(WATCHLIST_FILE, "utf-8");
}

function parseWatchlist() {
  return readRaw()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      const parts = line.split("|").map(p => p.trim());

      return {
        title: parts[0],
        type: parts[1],     // 🔥 important
        imdbId: parts[2],
      };
    });
}

async function getWatchlist(targetType) {
  const items = parseWatchlist();
  const metas = [];

  for (const item of items) {
    if (!item.imdbId || !item.type) continue;
    if (item.type !== targetType) continue;

    metas.push({
      id: item.imdbId,
      type: item.type,
      name: item.title,
      poster: `https://images.metahub.space/poster/medium/${item.imdbId}/img`,
    });
  }

  return metas;
}

module.exports = {
  readRaw,
  getWatchlist,
};