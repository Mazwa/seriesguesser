const fs = require("fs/promises");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const rawDir = path.join(dataDir, "raw");
const puzzlesDir = path.join(dataDir, "puzzles");
const catalogPath = path.join(dataDir, "shows.csv");
const topListPath = path.join(rawDir, "seriesgraph-top250.json");

const startRank = Number(process.argv[2] ?? 11);
const endRank = Number(process.argv[3] ?? 50);

if (!Number.isInteger(startRank) || !Number.isInteger(endRank) || startRank < 1 || endRank < startRank) {
  console.error("Usage: node scripts/import-seriesgraph-top.js <startRank> <endRank>");
  process.exit(1);
}

function parseShowUrl(url) {
  const match = url.match(/\/show\/(\d+)-(.+)$/);
  if (!match) {
    throw new Error(`Could not parse show URL: ${url}`);
  }

  const tmdbId = Number(match[1]);
  const sourceSlug = match[2];
  const fileSlug = sourceSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    tmdbId,
    sourceSlug,
    fileSlug,
    puzzleFile: `${tmdbId}-${fileSlug}.json`,
  };
}

function toYear(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const match = value.match(/^(\d{4})-/);
  return match ? Number(match[1]) : null;
}

function buildHighestRatedEpisode(seasons) {
  const episodes = seasons.flat();
  if (episodes.length === 0) {
    return null;
  }

  let bestRating = -Infinity;
  for (const episode of episodes) {
    if (typeof episode.rating === "number" && episode.rating > bestRating) {
      bestRating = episode.rating;
    }
  }

  const tied = episodes.filter((episode) => episode.rating === bestRating);
  tied.sort((a, b) => {
    if (a.numVotes !== b.numVotes) {
      return b.numVotes - a.numVotes;
    }
    if (a.season !== b.season) {
      return a.season - b.season;
    }
    return a.episode - b.episode;
  });

  const selected = tied[0];
  return {
    name: selected.name,
    season: selected.season,
    episode: selected.episode,
    rating: selected.rating,
    tieCount: tied.length,
  };
}

function normalizeSeasons(seasonRatingsResponse) {
  return seasonRatingsResponse.map((season) => {
    const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
    return episodes.map((episode) => ({
      episode: episode.episode_number,
      name: episode.name,
      rating: episode.vote_average,
      numVotes: episode.num_votes,
      season: episode.season_number,
    }));
  });
}

function toPuzzle(showEntry, showInfo, seasonRatings) {
  const { tmdbId, sourceSlug, fileSlug } = parseShowUrl(showEntry.url);
  const seasonsWithVotes = normalizeSeasons(seasonRatings);
  const seasons = seasonsWithVotes.map((season) => season.map(({ numVotes, season, ...episode }) => episode));
  const highestRatedEpisode = buildHighestRatedEpisode(seasonsWithVotes);

  return {
    tmdbId,
    sourceSlug,
    fileSlug,
    puzzle: {
      id: `${tmdbId}-${fileSlug}`,
      rank: showEntry.rank,
      answer: showEntry.title,
      sourceUrl: showEntry.url,
      sourceApi: {
        show: `https://seriesgraph.com/api/shows/${tmdbId}`,
        seasonRatings: `https://seriesgraph.com/api/shows/${tmdbId}/season-ratings`,
      },
      years: {
        first: toYear(showInfo.first_air_date),
        last: toYear(showInfo.last_air_date),
      },
      highestRatedEpisode,
      seasons,
    },
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "seriesguesser-import-script",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function readTopList() {
  const raw = await fs.readFile(topListPath, "utf8");
  const parsed = JSON.parse(raw);
  const shows = Array.isArray(parsed) ? parsed : parsed.shows;

  return shows.map((show) => ({
    rank: show.rank,
    title: show.title,
    url: `https://seriesgraph.com/show/${show.tmdbId}-${show.slug}`,
  }));
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

async function readCatalogMap() {
  const raw = await fs.readFile(catalogPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  const rows = lines.map((line) => {
    const [rank, enabled, tmdbId, slug, title, puzzleFile] = parseCsvLine(line);
    return {
      rank: Number(rank),
      enabled: Number(enabled),
      tmdb_id: Number(tmdbId),
      slug,
      title,
      puzzle_file: puzzleFile,
    };
  });

  return { header, rows };
}

function escapeCsv(value) {
  const stringValue = String(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, "\"\"")}"` : stringValue;
}

async function main() {
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(puzzlesDir, { recursive: true });

  const topList = await readTopList();
  const targetShows = topList.filter((show) => show.rank >= startRank && show.rank <= endRank);
  const { header, rows: existingRows } = await readCatalogMap();
  const rowMap = new Map(existingRows.map((row) => [row.rank, row]));
  const failures = [];

  for (const show of targetShows) {
    try {
      const { tmdbId, sourceSlug, fileSlug, puzzleFile } = parseShowUrl(show.url);
      console.log(`Importing rank ${show.rank}: ${show.title}`);

      const showApiUrl = `https://seriesgraph.com/api/shows/${tmdbId}`;
      const seasonRatingsUrl = `https://seriesgraph.com/api/shows/${tmdbId}/season-ratings`;

      const [showInfo, seasonRatings] = await Promise.all([
        fetchJson(showApiUrl),
        fetchJson(seasonRatingsUrl),
      ]);

      const rawShowPath = path.join(rawDir, `seriesgraph-show-${tmdbId}-${fileSlug}.json`);
      await fs.writeFile(
        rawShowPath,
        `${JSON.stringify(
          {
            rank: show.rank,
            title: show.title,
            tmdb_id: tmdbId,
            slug: sourceSlug,
            show_api: showApiUrl,
            season_ratings_api: seasonRatingsUrl,
            show_url: show.url,
            show: showInfo,
            season_ratings: seasonRatings,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const { puzzle } = toPuzzle(show, showInfo, seasonRatings);
      const puzzlePath = path.join(puzzlesDir, puzzleFile);
      await fs.writeFile(puzzlePath, `${JSON.stringify(puzzle, null, 2)}\n`, "utf8");

      rowMap.set(show.rank, {
        rank: show.rank,
        enabled: 1,
        tmdb_id: tmdbId,
        slug: sourceSlug,
        title: show.title,
        puzzle_file: puzzleFile,
      });
    } catch (error) {
      failures.push({
        rank: show.rank,
        title: show.title,
        message: error.message,
      });
      console.error(`Failed rank ${show.rank}: ${show.title}`);
      console.error(error.message);
    }
  }

  const mergedRows = [...rowMap.values()].sort((a, b) => a.rank - b.rank);
  const csv = [
    header,
    ...mergedRows.map((row) =>
      [
        row.rank,
        row.enabled,
        row.tmdb_id,
        row.slug,
        escapeCsv(row.title),
        row.puzzle_file,
      ].join(","),
    ),
  ].join("\n");

  await fs.writeFile(catalogPath, `${csv}\n`, "utf8");
  console.log(`Imported ranks ${startRank}-${endRank}.`);

  if (failures.length > 0) {
    console.log("Failures:");
    for (const failure of failures) {
      console.log(`- Rank ${failure.rank} ${failure.title}: ${failure.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
