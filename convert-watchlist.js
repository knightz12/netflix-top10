const fs = require("fs");

const INPUT = "watchlist.txt";
const OUTPUT = "watchlist-converted.txt";

function fixTitle(title) {
  return String(title || "")
    .replace("Sh**ting Stars", "Shooting Stars")
    .replace("Meet Me after School", "Meet Me After School")
    .replace("Once upon a Small Town", "Once Upon a Small Town")
    .replace("We Are All Trying Here airing", "We Are All Trying Here")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLine(line) {
  const parts = line.split("|").map((p) => p.trim());

  return {
    title: fixTitle(parts[3] || parts[0]),
    type: parts[1] && parts[1].toLowerCase() === "movie" ? "movie" : "series",
    year: parts[2] || "",
  };
}

async function searchCinemeta(title, type, year) {
  const clean = title
    .replace(/:\s*Season.*$/i, "")
    .replace(/:\s*Limited Series$/i, "")
    .replace(/\(\d{4}\)/g, "")
    .trim();

  const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(
    clean
  )}.json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const metas = (data.metas || []).filter(
      (m) => m.id && m.id.startsWith("tt")
    );

    if (!metas.length) return null;

    const lower = clean.toLowerCase();

    const exactYear = metas.find((m) => {
      const metaYear = String(m.releaseInfo || "").slice(0, 4);
      return m.name && m.name.toLowerCase() === lower && metaYear === year;
    });

    const exact = metas.find(
      (m) => m.name && m.name.toLowerCase() === lower
    );

    const yearMatch = metas.find((m) => {
      const metaYear = String(m.releaseInfo || "").slice(0, 4);
      return year && metaYear === year;
    });

    return exactYear || exact || yearMatch || metas[0];
  } catch {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.log(`Missing ${INPUT}`);
    return;
  }

  const lines = fs
    .readFileSync(INPUT, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const output = [];

  for (const line of lines) {
    const item = parseLine(line);

    console.log(`Searching: ${item.title} (${item.type}, ${item.year})`);

    let found = await searchCinemeta(item.title, item.type, item.year);

    if (!found && item.type === "series") {
      found = await searchCinemeta(item.title, "movie", item.year);
    }

    if (!found && item.type === "movie") {
      found = await searchCinemeta(item.title, "series", item.year);
    }

    if (found && found.id) {
      output.push(`${item.title} | ${found.id}`);
      console.log(`✅ ${item.title} -> ${found.name} (${found.id})`);
    } else {
      output.push(item.title);
      console.log(`❌ No match: ${item.title}`);
    }
  }

  fs.writeFileSync(OUTPUT, output.join("\n"), "utf-8");

  console.log("");
  console.log(`Done: ${OUTPUT}`);
  console.log("Copy watchlist-converted.txt content into watchlist.txt");
}

main();