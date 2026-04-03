# Seriesguesser Handoff

## Project
- Workspace: `C:\Users\alexm\gamedev\seriesguesser`
- Game: browser-based TV show guessing game inspired by `framed.wtf`
- Current mode: local random puzzle on refresh from imported Series Graph data

## Current Structure
- `public/`
  - `index.html`: app shell
  - `styles.css`: UI/theme/layout
  - `app.js`: frontend gameplay logic, fetches puzzle from backend
- `data/`
  - `shows.csv`: catalog of imported shows with `enabled` flag
  - `puzzles/`: normalized per-show JSON files
  - `raw/`: original fetched/source files from Series Graph
  - `artifacts/`: screenshots and temporary outputs
- `server.js`
  - local backend
  - serves static files from `public/`
  - API endpoints:
    - `/api/puzzle/random`
    - `/api/shows`
- `package.json`
  - `npm start` runs `node server.js`

## Current Data
- Imported and normalized shows: ranks `1-10`
- Current `shows.csv` has all rows set to `enabled=1`
- Each puzzle JSON includes:
  - `id`
  - `rank`
  - `answer`
  - `sourceUrl`
  - `sourceApi`
  - `years.first`
  - `years.last`
  - `highestRatedEpisode`
  - `seasons[]` with episode ratings

## Current Gameplay
- Refresh loads a random enabled show from `data/shows.csv`
- Guess flow:
  - Guess 1: only season 1 visible
  - Guess 2: full ratings grid visible
  - Guess 3: first season year
  - Guess 4: final season year
  - Guess 5: highest-rated episode
- Skip button advances clue state without typing a guess
- Guess tracker in top-right uses boxes:
  - red for used misses/skips
  - green for winning guess
- End-state button copies result to clipboard

## Current UI Notes
- Dark theme
- Page background is black
- Ratings color buckets:
  - `9.7+`: light blue
  - `9.0-9.6`: dark green
  - `8.0-8.9`: light green
  - `7.0-7.9`: yellow
  - `6.0-6.9`: orange
  - `<6.0`: purple
- Tile text:
  - dark text only for `7.0-8.9`
  - white text otherwise
- Ratings shown in one grid:
  - seasons are columns
  - episodes run downward
  - left column shows episode count
  - before clue 2, only season 1 and its episode count are shown

## Source Of Truth
- App behavior: `public/app.js`
- Styling/layout: `public/styles.css`
- Markup: `public/index.html`
- Server/API: `server.js`
- Imported show list: `data/shows.csv`
- Puzzle data: `data/puzzles/*.json`

## Important Constraint
- Use the normalized JSON data consistently
- Do not hand-edit ratings in frontend code
- Earlier bug came from hardcoded `Ozymandias = 10.0`; this was fixed by aligning app data with extracted Series Graph data

## Run Instructions
- Default:
```powershell
npm start
```
- If port `3000` is already in use:
```powershell
$env:PORT=3100
npm start
```
- Open:
  - `http://localhost:3000/`
  - or `http://localhost:3100/`

## Data Import Pattern
- Source endpoints used:
  - `https://seriesgraph.com/api/top-rated`
  - `https://seriesgraph.com/api/shows/{tmdbId}`
  - `https://seriesgraph.com/api/shows/{tmdbId}/season-ratings`
- Current import approach:
  - fetch top list
  - fetch show metadata + season ratings
  - normalize into `data/puzzles/*.json`
  - append/update `data/shows.csv`

## Likely Next Task
- Import more shows beyond ranks `1-10`
- Best next chunk: ranks `11-25`

## Ignore / Low Value
- Old screenshots and temp outputs in `data/artifacts/`
- Raw fetch dumps in `data/raw/` unless debugging extraction
