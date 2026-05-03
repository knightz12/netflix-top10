const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const URLS = {
  movie: "https://www.netflix.com/tudum/top10/philippines",
  series: "https://www.netflix.com/tudum/top10/philippines/tv",
};

const CACHE_MS = 6 * 60 * 60 * 1000;

let cache = {
  movie: { time: 0, metas: [] },
  series: { time: 0, metas: [] },
};

const manifest = {
  id: "org.netflix.tudum.ph.top10.fixed",
  version: "4.0.0",
  name: "Netflix PH Top 10 Weekly",
  description: "Netflix Philippines weekly Top 10 movies and series from Tudum",
  resources: ["catalog"],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "netflix_ph_top10_movies",
      name: "Netflix PH Top 10 Movies",
    },
    {
      type: "series",
      id: "netflix_ph_top10_series",
      name: "Netflix PH Top 10 Series",
    },
  ],
};

function cleanTitle(title) {
  return String(title || "")
    .replace(/^Image:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) throw new Error(`Netflix HTTP ${res.status}`);
  return await res.text();
}

function extractTitles(html, type) {
  const $ = cheerio.load(html);

  const sectionTitle =
    type === "movie"
      ? "Top 10 Movies in Philippines"
      : "Top 10 Shows in Philippines";

  const overviewTitle =
    type === "movie"
      ? "Top 10 Movies in Philippines overview"
      : "Top 10 Shows in Philippines overview";

  let start = html.indexOf(sectionTitle);
  let end = html.indexOf(overviewTitle);

  if (start === -1) start = 0;
  if (end === -1 || end < start) end = html.length;

  const sectionHtml = html.slice(start, end);
  const $$ = cheerio.load(sectionHtml);

  const titles = [];

  $$("img[alt]").each((_, img) => {
    const alt = cleanTitle($$(img).attr("alt"));

    if (
      alt &&
      alt.toLowerCase().startsWith("image:") === false &&
      !alt.toLowerCase().includes("netflix") &&
      !titles.includes(alt)
    ) {
      titles.push(alt);
    }
  });

  const rawAltRegex = /alt=["']Image:\s*([^"']+)["']/gi;
  let m;

  while ((m = rawAltRegex.exec(sectionHtml)) !== null) {
    const title = cleanTitle(m[1]);

    if (title && !titles.includes(title)) {
      titles.push(title);
    }
  }

  if (titles.length < 10) {
    const text = $("body").text().replace(/\s+/g, " ");
    const overviewStart = text.indexOf(overviewTitle);
    const catchStart = text.indexOf("Catch the Latest", overviewStart);

    let block =
      overviewStart !== -1
        ? text.slice(overviewStart, catchStart !== -1 ? catchStart : undefined)
        : text;

    const regex =
      /\b(01|02|03|04|05|06|07|08|09|10)\s*(?:Image)?\s*(.+?)\s+\d+(?=\s*(01|02|03|04|05|06|07|08|09|10)\s*(?:Image)?|$)/g;

    let match;
    while ((match = regex.exec(block)) !== null) {
      const title = cleanTitle(match[2]);

      if (title && !titles.includes(title)) {
        titles.push(title);
      }
    }
  }

  return titles.slice(0, 10);
}

async function fetchTudum(type) {
  const html = await fetchHtml(URLS[type]);
  const titles = extractTitles(html, type);

  console.log(`${type} titles:`, titles);

  return titles;
}

async function searchCinemeta(title, type) {
  try {
    const clean = title
      .replace(/:\s*Season.*$/i, "")
      .replace(/:\s*Limited Series$/i, "")
      .trim();

    const query = encodeURIComponent(clean);

    const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${query}.json`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const metas = data.metas || [];

    if (!metas.length) return null;

    // 1. EXACT MATCH
    let exact = metas.find(
      (m) =>
        m.name &&
        m.name.toLowerCase().trim() === clean.toLowerCase()
    );

    if (exact) return exact;

    // 2. CONTAINS MATCH
    let contains = metas.find(
      (m) =>
        m.name &&
        m.name.toLowerCase().includes(clean.toLowerCase())
    );

    if (contains) return contains;

    // 3. fallback
    return metas[0];
  } catch {
    return null;
  }
}

async function getCatalog(type) {
  const now = Date.now();

  if (cache[type].metas.length && now - cache[type].time < CACHE_MS) {
    return cache[type].metas;
  }

  const titles = await fetchTudum(type);
  const metas = [];

  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    const found = await searchCinemeta(title, type);

    if (found) {
      metas.push({
        ...found,
        type,
        name: `#${i + 1} ${found.name}`,
        description:
          `Netflix Philippines Weekly Top 10 #${i + 1}\n\n` +
          (found.description || ""),
      });
    } else {
      metas.push({
        id: `netflix-ph-${type}-${i + 1}-${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
        type,
        name: `#${i + 1} ${title}`,
        poster: "",
        description: `Netflix Philippines Weekly Top 10 #${i + 1}`,
      });
    }
  }

  cache[type] = { time: now, metas };
  return metas;
}

app.get("/", (req, res) => {
  res.send("Netflix PH Top 10 addon running");
});

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

app.get("/catalog/:type/:id.json", async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type === "movie" && id === "netflix_ph_top10_movies") {
      return res.json({ metas: await getCatalog("movie") });
    }

    if (type === "series" && id === "netflix_ph_top10_series") {
      return res.json({ metas: await getCatalog("series") });
    }

    return res.json({ metas: [] });
  } catch (err) {
    console.error(err);
    return res.json({ metas: [] });
  }
});

app.get("/debug/:type", async (req, res) => {
  const type = req.params.type === "series" ? "series" : "movie";
  const titles = await fetchTudum(type);
  res.json({ type, titles });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Running: http://localhost:${PORT}/manifest.json`);
});