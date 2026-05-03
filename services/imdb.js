const cheerio = require("cheerio");

/* ---------------- NETFLIX TITLES ---------------- */

async function fetchNetflixTitles() {
  try {
    const res = await fetch("https://www.netflix.com/tudum/top10/philippines");
    const html = await res.text();

    const $ = cheerio.load(html);
    const titles = [];

    $("img[alt]").each((_, el) => {
      const t = ($(el).attr("alt") || "")
        .replace(/^Image:\s*/i, "")
        .trim();

      if (t && !titles.includes(t)) {
        titles.push(t);
      }
    });

    return titles.slice(0, 10);
  } catch (e) {
    console.error("Netflix fetch error:", e);
    return [];
  }
}

/* ---------------- CINEMETA SEARCH ---------------- */

async function searchCinemeta(title, type) {
  try {
    const res = await fetch(
      `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(title)}.json`
    );

    if (!res.ok) return null;

    const data = await res.json();

    const metas = (data.metas || []).filter(
      (m) => m && m.id && m.id.startsWith("tt")
    );

    if (!metas.length) return null;

    return metas[0];
  } catch (e) {
    console.error("Cinemeta search error:", e);
    return null;
  }
}

/* ---------------- AUTO IMDb ---------------- */

async function autoImdb(text) {
  const lines = text.split("\n");
  const out = [];

  for (const l of lines) {
    if (!l.trim()) continue;

    const title = l.split("|")[0].trim();

    const m =
      (await searchCinemeta(title, "series")) ||
      (await searchCinemeta(title, "movie"));

    if (m?.id) {
      out.push(`${title} | ${m.id}`);
    } else {
      out.push(title);
    }
  }

  return out.join("\n");
}

/* ---------------- EXPORT ---------------- */

module.exports = {
  fetchNetflixTitles,
  searchCinemeta,
  autoImdb,
};