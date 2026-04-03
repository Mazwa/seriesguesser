const fs = require("fs/promises");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const catalogCsvPath = path.join(dataDir, "shows.csv");
const catalogJsonPath = path.join(dataDir, "catalog.json");
const dailyOrderPath = path.join(dataDir, "daily-order.json");

const seed = process.argv[2] ?? "seriesguesser-season-1";
const startDate = process.argv[3] ?? "2026-04-02";
const timezone = process.argv[4] ?? "America/Chicago";

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  return body.map((cells) => {
    const entry = {};
    header.forEach((key, index) => {
      entry[key] = cells[index] || "";
    });
    return {
      rank: Number(entry.rank),
      enabled: entry.enabled === "1",
      tmdbId: Number(entry.tmdb_id),
      slug: entry.slug,
      title: entry.title,
      puzzleFile: entry.puzzle_file,
    };
  });
}

function xmur3(value) {
  let hash = 1779033703 ^ value.length;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
}

function mulberry32(seedValue) {
  let state = seedValue >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seedText) {
  const hash = xmur3(seedText)();
  const random = mulberry32(hash);
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

async function main() {
  const csv = await fs.readFile(catalogCsvPath, "utf8");
  const catalog = parseCsv(csv).sort((left, right) => left.rank - right.rank);
  const enabledCatalog = catalog.filter((row) => row.enabled);
  const order = seededShuffle(enabledCatalog, seed).map((row, index) => ({
    day: index + 1,
    rank: row.rank,
    tmdbId: row.tmdbId,
    title: row.title,
    puzzleFile: row.puzzleFile,
  }));

  const dailyOrder = {
    version: 1,
    season: 1,
    seed,
    timezone,
    startDate,
    eligibleCount: enabledCatalog.length,
    generatedAt: new Date().toISOString(),
    order,
  };

  await fs.writeFile(catalogJsonPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await fs.writeFile(dailyOrderPath, `${JSON.stringify(dailyOrder, null, 2)}\n`, "utf8");

  console.log(`Wrote ${catalog.length} catalog rows to ${catalogJsonPath}`);
  console.log(`Wrote ${order.length} daily entries to ${dailyOrderPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
