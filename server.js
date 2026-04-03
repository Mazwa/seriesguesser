const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const puzzleDir = path.join(dataDir, "puzzles");
const catalogPath = path.join(dataDir, "shows.csv");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
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
    return entry;
  });
}

function loadCatalog() {
  const csv = fs.readFileSync(catalogPath, "utf8");
  return parseCsv(csv);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(response);
}

function notFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function randomPuzzle() {
  const enabledShows = loadCatalog().filter((row) => row.enabled === "1");
  if (!enabledShows.length) {
    return null;
  }

  const selected = enabledShows[Math.floor(Math.random() * enabledShows.length)];
  const filePath = path.join(puzzleDir, selected.puzzle_file);
  const puzzle = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return puzzle;
}

function serveStatic(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(publicDir, normalizedPath));

  if (!filePath.startsWith(publicDir)) {
    return notFound(response);
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      return notFound(response);
    }
    sendFile(response, filePath);
  });
}

function serveData(requestPath, response) {
  const filePath = path.normalize(path.join(rootDir, requestPath.slice(1)));

  if (!filePath.startsWith(dataDir)) {
    return notFound(response);
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      return notFound(response);
    }
    sendFile(response, filePath);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname.startsWith("/data/")) {
    return serveData(url.pathname, response);
  }

  if (url.pathname === "/api/puzzle/random") {
    const puzzle = randomPuzzle();
    if (!puzzle) {
      return sendJson(response, 500, { error: "No enabled puzzles found." });
    }
    return sendJson(response, 200, puzzle);
  }

  if (url.pathname === "/api/shows") {
    return sendJson(response, 200, loadCatalog());
  }

  return serveStatic(url.pathname, response);
});

server.listen(port, () => {
  console.log(`Seriesguesser running at http://localhost:${port}`);
});
