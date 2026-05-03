async function search(title, type) {
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(title)}.json`);
    const data = await res.json();
    return data.metas?.[0] || null;
  } catch {
    return null;
  }
}

async function autoImdb(text) {
  const lines = text.split("\n");
  const out = [];

  for (const l of lines) {
    const title = l.split("|")[0].trim();
    const m = await search(title, "series") || await search(title, "movie");
    out.push(m?.id ? `${title} | ${m.id}` : title);
  }

  return out.join("\n");
}

module.exports = { search, autoImdb };
