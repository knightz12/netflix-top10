const cheerio = require("cheerio");

/* ---------------- NETFLIX TITLES ---------------- */

async function fetchNetflixTitles(type = "movie") {
  try {
    const url =
      type === "series"
        ? "https://www.netflix.com/tudum/top10/philippines/tv"
        : "https://www.netflix.com/tudum/top10/philippines";

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return [];

    const html = await res.text();

    const sectionTitle =
      type === "series"
        ? "Top 10 Shows in Philippines"
        : "Top 10 Movies in Philippines";

    const overviewTitle =
      type === "series"
        ? "Top 10 Shows in Philippines overview"
        : "Top 10 Movies in Philippines overview";

    let start = html.indexOf(sectionTitle);
    let end = html.indexOf(overviewTitle);

    if (start === -1) start = 0;
    if (end === -1 || end < start) end = html.length;

    const sectionHtml = html.slice(start, end);
    const $ = cheerio.load(sectionHtml);

    const titles = [];

    $("img[alt]").each((_, el) => {
      const t = ($(el).attr("alt") || "")
        .replace(/^Image:\s*/i, "")
        .trim();

      if (
        t &&
        !t.toLowerCase().includes("netflix") &&
        !titles.includes(t)
      ) {
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
    const clean = String(title || "")
      .replace(/:\s*Season.*$/i, "")
      .replace(/:\s*Limited Series$/i, "")
      .replace(/\(\d{4}\)/g, "")
      .trim();

    const res = await fetch(
      `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(clean)}.json`
    );

    if (!res.ok) return null;

    const data = await res.json();

    const metas = (data.metas || []).filter(
      (m) => m && m.id && m.id.startsWith("tt")
    );

    if (!metas.length) return null;

    const exact = metas.find(
      (m) => m.name && m.name.toLowerCase().trim() === clean.toLowerCase()
    );

    return exact || metas[0];
  } catch (e) {
    console.error("Cinemeta search error:", e);
    return null;
  }
}

/* ---------------- AUTO IMDb ---------------- */

async function autoImdb(text) {
  const lines = text.split(/\r?\n/);
  const out = [];

  for (const l of lines) {
    const line = l.trim();

    // keep blank lines
    if (!line) {
      out.push("");
      continue;
    }

    // keep headers/comments
    if (line.startsWith("#")) {
      out.push(line);
      continue;
    }

    const parts = line.split("|").map((p) => p.trim());
    const title = parts[0];
    const existingImdb = parts[1];

    // keep already matched IMDb
    if (existingImdb && existingImdb.startsWith("tt")) {
      out.push(`${title} | ${existingImdb}`);
      continue;
    }

    const m =
      (await searchCinemeta(title, "series")) ||
      (await searchCinemeta(title, "movie"));

    if (m?.id) {
      out.push(`${title} | ${m.id}`);
    } else {
      out.push(title); // keep title, never blank
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