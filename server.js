const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");
const { createCanvas, loadImage } = require("canvas");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const MDL_USERNAME = "knightz12";

const URLS = {
  movie: "https://www.netflix.com/tudum/top10/philippines",
  series: "https://www.netflix.com/tudum/top10/philippines/tv",
};

const CACHE_MS = 6 * 60 * 60 * 1000;

let cache = {
  movie: { time: 0, metas: [] },
  series: { time: 0, metas: [] },
  mdl_watchlist: { time: 0, metas: [] },
  mdl_completed: { time: 0, metas: [] },
};

const manifest = {
  id: "org.netflix.mdl.combo.knightz12",
  version: "6.0.0",
  name: "Netflix PH + MyDramaList",
  description: "Netflix PH Top 10 + MyDramaList catalogs",
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
    {
      type: "series",
      id: "mdl_watchlist",
      name: "MDL Plan To Watch",
    },
    {
      type: "series",
      id: "mdl_completed",
      name: "MDL Completed",
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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://mydramalist.com/",
      "Connection": "keep-alive"
    },
  });

  if (!res.ok) {
    throw new Error(`MDL HTTP ${res.status}`);
  }

  return await res.text();
}

function extractWeek(html) {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ");

  const match =
    text.match(/Week of\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i) ||
    text.match(/Global Top 10\s+Week of\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);

  return match ? match[1] : "Latest Week";
}

function extractNetflixTitles(html, type) {
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
    if (title && !titles.includes(title)) titles.push(title);
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
      if (title && !titles.includes(title)) titles.push(title);
    }
  }

  return titles.slice(0, 10);
}

async function fetchNetflix(type) {
  const html = await fetchHtml(URLS[type]);

  return {
    week: extractWeek(html),
    titles: extractNetflixTitles(html, type),
  };
}

function cleanForSearch(title) {
  return String(title || "")
    .replace(/:\s*Season.*$/i, "")
    .replace(/:\s*Limited Series$/i, "")
    .replace(/\(\d{4}\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchCinemeta(title, type) {
  try {
    const clean = cleanForSearch(title);

    const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(
      clean
    )}.json`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const metas = data.metas || [];

    if (!metas.length) return null;

    const exact = metas.find(
      (m) => m.name && m.name.toLowerCase().trim() === clean.toLowerCase()
    );

    const contains = metas.find(
      (m) => m.name && m.name.toLowerCase().includes(clean.toLowerCase())
    );

    return exact || contains || metas[0];
  } catch {
    return null;
  }
}

function overlayPosterUrl(originalPoster, rank) {
  if (!originalPoster) return "";

  const highRes = originalPoster
    .replace(/\/small\//g, "/large/")
    .replace(/\/medium\//g, "/large/");

  return `/poster?img=${encodeURIComponent(highRes)}&rank=${rank}`;
}

async function getNetflixCatalog(type, req) {
  const now = Date.now();

  if (cache[type].metas.length && now - cache[type].time < CACHE_MS) {
    return cache[type].metas;
  }

  const { week, titles } = await fetchNetflix(type);
  const metas = [];
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  for (let i = 0; i < titles.length; i++) {
    const rank = i + 1;
    const title = titles[i];
    const found = await searchCinemeta(title, type);

    if (found) {
      const poster = found.poster
        ? baseUrl + overlayPosterUrl(found.poster, rank)
        : found.poster;

      metas.push({
        ...found,
        type,
        poster,
        name: `🔥 #${rank} ${found.name}`,
        description:
          `Netflix Philippines Weekly Top 10\n` +
          `Rank: #${rank}\n` +
          `Week: ${week}\n\n` +
          (found.description || ""),
      });
    } else {
      metas.push({
        id: `netflix-ph-${type}-${rank}-${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
        type,
        name: `🔥 #${rank} ${title}`,
        poster: "",
        description: `Netflix Philippines Weekly Top 10\nRank: #${rank}\nWeek: ${week}`,
      });
    }
  }

  cache[type] = { time: now, metas };
  return metas;
}

async function fetchMDLList(username, listType) {
  try {
    const url = `https://mydramalist.com/dramalist/${username}/${listType}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const titles = [];

    // MDL usually stores drama titles in these links
    $("a[href^='/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const title = cleanTitle($(el).text());

      if (
        title &&
        href.match(/^\/\d+-/) &&
        title.length > 1 &&
        !title.toLowerCase().includes("edit") &&
        !title.toLowerCase().includes("add") &&
        !title.toLowerCase().includes("more") &&
        !title.toLowerCase().includes("review") &&
        !titles.includes(title)
      ) {
        titles.push(title);
      }
    });

    console.log("MDL titles found:", titles);

    return titles.slice(0, 100);
  } catch (e) {
    console.error("MDL fetch failed:", e.message);
    return [];
  }
}

async function getMDLCatalog(cacheKey, listType) {
  const now = Date.now();

  if (cache[cacheKey].metas.length && now - cache[cacheKey].time < CACHE_MS) {
    return cache[cacheKey].metas;
  }

  const titles = await fetchMDLList(MDL_USERNAME, listType);
  const metas = [];

  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];

    let found = await searchCinemeta(title, "series");

    if (!found) {
      found = await searchCinemeta(title, "movie");
    }

    if (found) {
      metas.push({
        ...found,
        type: found.type || "series",
        name: `⭐ ${found.name}`,
        description:
          `From MyDramaList: ${listType.replace(/_/g, " ")}\n\n` +
          (found.description || ""),
      });
    } else {
      metas.push({
        id: `mdl-${listType}-${i + 1}-${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
        type: "series",
        name: `⭐ ${title}`,
        poster: "",
        description: `From MyDramaList: ${listType.replace(/_/g, " ")}`,
      });
    }
  }

  cache[cacheKey] = { time: now, metas };
  return metas;
}

app.get("/", (req, res) => {
  res.send("Netflix PH + MDL Stremio addon running");
});

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

app.get("/poster", async (req, res) => {
  try {
    const imgUrl = req.query.img;
    const rank = req.query.rank || "?";

    if (!imgUrl) return res.status(404).send("Missing poster");

    const image = await loadImage(imgUrl);

    const canvas = createCanvas(500, 750);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(image, 0, 0, 500, 750);

    const gradientTop = ctx.createLinearGradient(0, 0, 0, 180);
    gradientTop.addColorStop(0, "rgba(0,0,0,0.65)");
    gradientTop.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradientTop;
    ctx.fillRect(0, 0, 500, 180);

    const gradientBottom = ctx.createLinearGradient(0, 520, 0, 750);
    gradientBottom.addColorStop(0, "rgba(0,0,0,0)");
    gradientBottom.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = gradientBottom;
    ctx.fillRect(0, 520, 500, 230);

    ctx.fillStyle = "#E50914";
    roundRect(ctx, 18, 18, 140, 44, 10);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("NETFLIX", 88, 48);

    ctx.fillStyle = "rgba(0,0,0,0.85)";
    roundRect(ctx, 20, 655, 165, 58, 16);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`🔥 #${rank}`, 102, 695);

    res.setHeader("Content-Type", "image/png");
    canvas.createPNGStream().pipe(res);
  } catch (e) {
    console.error("Poster error:", e.message);

    if (req.query.img) return res.redirect(req.query.img);

    return res.status(500).send("Poster failed");
  }
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

app.get("/catalog/:type/:id.json", async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type === "movie" && id === "netflix_ph_top10_movies") {
      return res.json({ metas: await getNetflixCatalog("movie", req) });
    }

    if (type === "series" && id === "netflix_ph_top10_series") {
      return res.json({ metas: await getNetflixCatalog("series", req) });
    }

    if (type === "series" && id === "mdl_watchlist") {
      return res.json({
        metas: await getMDLCatalog("mdl_watchlist", "plan_to_watch"),
      });
    }

    if (type === "series" && id === "mdl_completed") {
      return res.json({
        metas: await getMDLCatalog("mdl_completed", "completed"),
      });
    }

    return res.json({ metas: [] });
  } catch (err) {
    console.error(err);
    return res.json({ metas: [] });
  }
});

app.get("/debug/netflix/:type", async (req, res) => {
  const type = req.params.type === "series" ? "series" : "movie";
  const data = await fetchNetflix(type);
  res.json(data);
});

app.get("/debug/mdl/:list", async (req, res) => {
  const list = req.params.list || "plan_to_watch";
  const titles = await fetchMDLList(MDL_USERNAME, list);
  res.json({ username: MDL_USERNAME, list, count: titles.length, titles });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Running: http://localhost:${PORT}/manifest.json`);
});