const fs = require("fs");
const { WATCHLIST_FILE } = require("../config");
const { searchCinemeta } = require("./imdb");

function readRaw() {
  if (!fs.existsSync(WATCHLIST_FILE)) {
    fs.writeFileSync(WATCHLIST_FILE, "", "utf-8");
  }

  return fs.readFileSync(WATCHLIST_FILE, "utf-8");
}

function parseWatchlist() {
  return readRaw()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());

      return {
        title: parts[0],
        imdbId: parts[1] && parts[1].startsWith("tt") ? parts[1] : null,
      };
    });
}

async function getMetaByImdbId(imdbId, type) {
  try {
    const res = await fetch(
      `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`
    );

    if (!res.ok) return null;

    const data = await res.json();
    return data.meta || null;
  } catch {
    return null;
  }
}

async function getWatchlist(type) {
  const items = parseWatchlist();
  const metas = [];

  for (const item of items) {
    let meta = null;

    if (item.imdbId) {
      meta = await getMetaByImdbId(item.imdbId, type);
    }

    if (!meta) {
      meta = await searchCinemeta(item.title, type);
    }

    if (meta && meta.id) {
      metas.push({
        ...meta,
        type,
      });
    }
  }

  return metas;
}

module.exports = {
  readRaw,
  getWatchlist,
};