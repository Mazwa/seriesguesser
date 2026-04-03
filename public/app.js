const maxGuesses = 5;
const shareUrl = "https://mazwa.github.io/seriesguesser/";
const dayMs = 24 * 60 * 60 * 1000;

const guessInput = document.querySelector("#guess-input");
const guessButton = document.querySelector("#guess-button");
const skipButton = document.querySelector("#skip-button");
const statusMessage = document.querySelector("#status-message");
const guessTracker = document.querySelector("#guess-tracker");
const resultPanel = document.querySelector("#result-panel");
const resultTitle = document.querySelector("#result-title");
const resultSummary = document.querySelector("#result-summary");
const resultAnswer = document.querySelector("#result-answer");
const shareButton = document.querySelector("#share-button");
const sharePreview = document.querySelector("#share-preview");
const ratingsMatrix = document.querySelector("#ratings-matrix");
const firstYear = document.querySelector("#first-year");
const lastYear = document.querySelector("#last-year");
const bestEpisode = document.querySelector("#best-episode");
const guessSuggestions = document.querySelector("#guess-suggestions");
const hintText = document.querySelector(".hint-text");
const revealCards = [...document.querySelectorAll(".reveal-card")];

let puzzle = null;
let showCatalog = [];
let activeSuggestionIndex = -1;
let previousRevealStage = 1;
let dailyOrder = null;
const state = loadState();

guessButton.addEventListener("click", submitGuess);
skipButton.addEventListener("click", skipGuess);
guessInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    moveSuggestionSelection(1);
    event.preventDefault();
    return;
  }

  if (event.key === "ArrowUp") {
    moveSuggestionSelection(-1);
    event.preventDefault();
    return;
  }

  if (event.key === "Enter") {
    if (selectActiveSuggestion()) {
      event.preventDefault();
      return;
    }
    submitGuess();
  }

  if (event.key === "Escape") {
    hideSuggestions();
  }
});
guessInput.addEventListener("input", updateSuggestions);
guessInput.addEventListener("blur", () => {
  window.setTimeout(hideSuggestions, 100);
});
shareButton.addEventListener("click", copyResult);

boot();

async function boot() {
  setStatus("Loading puzzle...", "");
  disableInputs(true);

  try {
    const [catalogResponse, dailyOrderResponse] = await Promise.all([
      fetch(`data/catalog.json?ts=${Date.now()}`),
      fetch(`data/daily-order.json?ts=${Date.now()}`),
    ]);

    if (!catalogResponse.ok) {
      throw new Error(`Failed to load catalog: ${catalogResponse.status}`);
    }

    if (!dailyOrderResponse.ok) {
      throw new Error(`Failed to load daily order: ${dailyOrderResponse.status}`);
    }

    [showCatalog, dailyOrder] = await Promise.all([
      catalogResponse.json(),
      dailyOrderResponse.json(),
    ]);

    showCatalog = showCatalog
      .filter((show) => show.enabled)
      .map((show) => ({
        title: show.title,
        normalized: normalize(show.title),
      }));

    const todayEntry = getTodayEntry(dailyOrder);
    if (!todayEntry) {
      setStatus("No daily puzzle is scheduled for today.", "error");
      hintText.textContent = buildScheduleHint(dailyOrder);
      return;
    }

    const puzzleResponse = await fetch(`data/puzzles/${todayEntry.puzzleFile}?ts=${Date.now()}`);
    if (!puzzleResponse.ok) {
      throw new Error(`Failed to load puzzle: ${puzzleResponse.status}`);
    }

    puzzle = await puzzleResponse.json();
    hintText.textContent = buildScheduleHint(dailyOrder, todayEntry);

    render();
    setStatus("", "");
    disableInputs(false);
  } catch (error) {
    setStatus("Couldn't load the daily puzzle.", "error");
    hintText.textContent = "Check that the static data files are present and refresh the page.";
  }
}

function loadState() {
  return {
    guesses: [],
    solved: false,
    lost: false,
    revealStage: 1,
  };
}

function submitGuess() {
  if (!puzzle || state.solved || state.lost) {
    return;
  }

  const guess = guessInput.value.trim();
  if (!guess) {
    setStatus("Enter a show title first.", "error");
    return;
  }

  if (state.guesses.length >= maxGuesses) {
    return;
  }

  state.guesses.push(guess);
  const correct = normalize(guess) === normalize(puzzle.answer);

  if (correct) {
    state.solved = true;
    setStatus(`Correct. The answer is ${puzzle.answer}.`, "success");
  } else {
    const guessesUsed = state.guesses.length;
    state.revealStage = Math.min(maxGuesses, guessesUsed + 1);

    if (guessesUsed >= maxGuesses) {
      state.lost = true;
      setStatus(`Out of guesses. The answer was ${puzzle.answer}.`, "error");
    } else {
      setStatus(`Not it. Clue ${state.revealStage} is now unlocked.`, "error");
    }
  }

  guessInput.value = "";
  render();
}

function skipGuess() {
  if (!puzzle || state.solved || state.lost) {
    return;
  }

  if (state.guesses.length >= maxGuesses) {
    return;
  }

  state.guesses.push("SKIP");
  const guessesUsed = state.guesses.length;
  state.revealStage = Math.min(maxGuesses, guessesUsed + 1);

  if (guessesUsed >= maxGuesses) {
    state.lost = true;
    setStatus(`Out of clues. The answer was ${puzzle.answer}.`, "error");
  } else {
    setStatus(`Skipped. Clue ${state.revealStage} is now unlocked.`, "success");
  }

  render();
}

function render() {
  if (!puzzle) {
    return;
  }

  renderGuessTracker();
  updateRevealCards();
  updateFacts();
  renderMatrix();

  const gameOver = state.solved || state.lost;
  resultPanel.hidden = !gameOver;
  disableInputs(gameOver);

  if (gameOver) {
    const guessesUsed = state.guesses.length;
    const shareText = buildShareText();

    if (state.solved) {
      resultTitle.textContent = "Solved";
      resultSummary.textContent = `You got it in ${guessesUsed} ${guessesUsed === 1 ? "guess" : "guesses"}.`;
    } else {
      resultTitle.textContent = "Missed";
      resultSummary.textContent = "Five guesses used.";
    }
    resultAnswer.textContent = puzzle.answer;

    sharePreview.textContent = shareText;
  }

  previousRevealStage = state.revealStage;
}

function renderGuessTracker() {
  guessTracker.innerHTML = "";

  for (let index = 0; index < maxGuesses; index += 1) {
    const box = document.createElement("span");
    box.className = "guess-box future";

    if (index < state.guesses.length) {
      const isWinningGuess =
        state.solved &&
        index === state.guesses.length - 1 &&
        normalize(state.guesses[index]) === normalize(puzzle.answer);

      box.className = `guess-box ${isWinningGuess ? "win" : "miss"}`;
    }

    guessTracker.appendChild(box);
  }
}

function updateRevealCards() {
  revealCards.forEach((card) => {
    const stage = Number(card.dataset.stage);
    card.classList.toggle("locked", stage > state.revealStage);
    card.classList.toggle("active", stage === state.revealStage && !(state.solved || state.lost));
  });
}

function updateFacts() {
  const showFirstYear = state.revealStage >= 3 || state.solved || state.lost;
  const showLastYear = state.revealStage >= 4 || state.solved || state.lost;
  const showBestEpisode = state.revealStage >= 5 || state.solved || state.lost;

  firstYear.textContent = `First season year: ${showFirstYear ? puzzle.years.first : "Hidden"}`;
  lastYear.textContent = `Final season year: ${showLastYear ? puzzle.years.last : "Hidden"}`;
  bestEpisode.textContent = `Highest-rated episode: ${
    showBestEpisode
      ? `${puzzle.highestRatedEpisode.name} (${episodeCode(puzzle.highestRatedEpisode.season, puzzle.highestRatedEpisode.episode)})`
      : "Hidden"
  }`;

  firstYear.classList.toggle("locked", !showFirstYear);
  lastYear.classList.toggle("locked", !showLastYear);
  bestEpisode.classList.toggle("locked", !showBestEpisode);

  flashClue(firstYear, showFirstYear && previousRevealStage < 3 && state.revealStage >= 3);
  flashClue(lastYear, showLastYear && previousRevealStage < 4 && state.revealStage >= 4);
  flashClue(bestEpisode, showBestEpisode && previousRevealStage < 5 && state.revealStage >= 5);
}

function renderMatrix() {
  ratingsMatrix.innerHTML = "";

  const showAll = state.revealStage >= 2 || state.solved || state.lost;
  const visibleSeasons = showAll ? puzzle.seasons : [puzzle.seasons[0]];
  const maxEpisodes = visibleSeasons.reduce((max, season) => Math.max(max, season.length), 0);

  const episodeIndex = document.createElement("div");
  episodeIndex.className = "episode-index";

  const spacer = document.createElement("div");
  spacer.className = "episode-index-spacer";
  episodeIndex.appendChild(spacer);

  for (let episodeNumber = 1; episodeNumber <= maxEpisodes; episodeNumber += 1) {
    const indexCell = document.createElement("div");
    indexCell.className = "episode-index-cell";
    indexCell.textContent = String(episodeNumber);
    episodeIndex.appendChild(indexCell);
  }

  const grid = document.createElement("div");
  grid.className = "ratings-matrix";
  grid.style.gridTemplateColumns = `repeat(${visibleSeasons.length}, var(--tile-size))`;
  grid.style.minWidth = `calc((${visibleSeasons.length} * var(--tile-size)) + (${Math.max(visibleSeasons.length - 1, 0)} * var(--tile-gap)))`;

  puzzle.seasons.forEach((season, index) => {
    if (!showAll && index > 0) {
      return;
    }

    const column = document.createElement("section");
    column.className = "season-column";

    const label = document.createElement("p");
    label.className = "season-label";
    label.textContent = `Season ${index + 1}`;

    const cells = document.createElement("div");
    cells.className = "season-cells";

    season.forEach((episode) => {
      const tile = document.createElement("article");
      tile.className = "episode-tile";
      tile.style.background = colorForRating(episode.rating);
      tile.classList.toggle("dark-text", useDarkText(episode.rating));

      const rating = document.createElement("span");
      rating.className = "episode-rating";
      rating.textContent = episode.rating.toFixed(1);

      tile.appendChild(rating);
      cells.appendChild(tile);
    });

    for (let emptyIndex = season.length; emptyIndex < maxEpisodes; emptyIndex += 1) {
      const filler = document.createElement("div");
      filler.className = "episode-tile filler-tile";
      filler.setAttribute("aria-hidden", "true");
      cells.appendChild(filler);
    }

    column.append(label, cells);
    grid.appendChild(column);
  });

  ratingsMatrix.append(episodeIndex, grid);
}

function updateSuggestions() {
  if (!showCatalog.length || guessInput.disabled) {
    hideSuggestions();
    return;
  }

  const query = normalize(guessInput.value);
  if (!query) {
    hideSuggestions();
    return;
  }

  const matches = showCatalog
    .map((show) => ({ ...show, score: scoreMatch(query, show.normalized) }))
    .filter((show) => show.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.title.localeCompare(b.title);
    })
    .slice(0, 6);

  if (!matches.length) {
    hideSuggestions();
    return;
  }

  activeSuggestionIndex = -1;
  guessSuggestions.innerHTML = "";

  matches.forEach((match, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "guess-suggestion";
    option.dataset.index = String(index);
    option.innerHTML = `<span>${escapeHtml(match.title)}</span>`;
    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      applySuggestion(match.title);
    });
    guessSuggestions.appendChild(option);
  });

  guessSuggestions.hidden = false;
  guessInput.setAttribute("aria-expanded", "true");
}

function moveSuggestionSelection(direction) {
  if (guessSuggestions.hidden) {
    updateSuggestions();
  }

  const options = [...guessSuggestions.querySelectorAll(".guess-suggestion")];
  if (!options.length) {
    return;
  }

  activeSuggestionIndex =
    activeSuggestionIndex < 0
      ? direction > 0
        ? 0
        : options.length - 1
      : (activeSuggestionIndex + direction + options.length) % options.length;

  options.forEach((option, index) => {
    option.classList.toggle("active", index === activeSuggestionIndex);
  });
}

function selectActiveSuggestion() {
  const options = [...guessSuggestions.querySelectorAll(".guess-suggestion")];
  if (!options.length) {
    return false;
  }

  const selected =
    activeSuggestionIndex >= 0 ? options[activeSuggestionIndex] : options[0];

  if (!selected) {
    return false;
  }

  applySuggestion(selected.textContent.trim());
  return true;
}

function applySuggestion(title) {
  guessInput.value = title;
  hideSuggestions();
  guessInput.focus();
}

function hideSuggestions() {
  activeSuggestionIndex = -1;
  guessSuggestions.hidden = true;
  guessSuggestions.innerHTML = "";
  guessInput.setAttribute("aria-expanded", "false");
}

function scoreMatch(query, title) {
  if (title === query) return 1000;
  if (title.startsWith(query)) return 750;
  if (title.includes(query)) return 500;

  const queryWords = query.split(/\s+/).filter(Boolean);
  if (!queryWords.length) {
    return 0;
  }

  let matchedWords = 0;
  for (const word of queryWords) {
    if (title.includes(word)) {
      matchedWords += 1;
    }
  }

  return matchedWords === queryWords.length ? 250 + matchedWords : 0;
}

function flashClue(element, shouldFlash) {
  element.classList.remove("revealed");
  if (!shouldFlash) {
    return;
  }

  void element.offsetWidth;
  element.classList.add("revealed");
}

function colorForRating(rating) {
  if (rating >= 9.7) return "#7ddcff";
  if (rating >= 9.0) return "#1f7a3f";
  if (rating >= 8.0) return "#8fd14f";
  if (rating >= 7.0) return "#f0d34a";
  if (rating >= 6.0) return "#ef8a2f";
  return "#6d3cb2";
}

function useDarkText(rating) {
  return rating >= 7.0 && rating < 9.0;
}

function episodeCode(season, episode) {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type || ""}`.trim();
}

function disableInputs(disabled) {
  guessInput.disabled = disabled;
  guessButton.disabled = disabled;
  skipButton.disabled = disabled;
  if (disabled) {
    hideSuggestions();
  }
}

function buildShareText() {
  const score = state.solved ? `${state.guesses.length}/5` : "X/5";
  const dateLabel = dailyOrder ? getTodayDateLabel(dailyOrder.timezone) : "";
  const blocks = Array.from({ length: maxGuesses }, (_, index) => {
    if (state.solved && index === state.guesses.length - 1) {
      return "\uD83D\uDFE9";
    }
    if (index < Math.min(state.guesses.length, maxGuesses)) {
      return "\uD83D\uDFE5";
    }
    return "\u2B1C";
  }).join("");

  return `Seriesguesser ${dateLabel} ${score}\n${blocks}\n${shareUrl}`.trim();
}

function getTodayEntry(schedule) {
  if (!schedule?.order?.length) {
    return null;
  }

  const daysSinceStart = getDaysSinceStart(schedule.startDate, schedule.timezone);
  if (daysSinceStart < 0 || daysSinceStart >= schedule.order.length) {
    return null;
  }

  return schedule.order[daysSinceStart];
}

function getDaysSinceStart(startDate, timezone) {
  const today = getDatePartsInTimezone(timezone);
  const start = parseDateParts(startDate);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  return Math.floor((todayUtc - startUtc) / dayMs);
}

function getDatePartsInTimezone(timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year").value),
    month: Number(parts.find((part) => part.type === "month").value),
    day: Number(parts.find((part) => part.type === "day").value),
  };
}

function parseDateParts(value) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function getTodayDateLabel(timezone) {
  const { year, month, day } = getDatePartsInTimezone(timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildScheduleHint(schedule, todayEntry) {
  const dateLabel = getTodayDateLabel(schedule.timezone);

  if (todayEntry) {
    return `Daily puzzle for ${dateLabel}. New puzzle at midnight ${schedule.timezone}.`;
  }

  const daysSinceStart = getDaysSinceStart(schedule.startDate, schedule.timezone);
  if (daysSinceStart < 0) {
    return `Daily puzzles begin on ${schedule.startDate} in ${schedule.timezone}.`;
  }

  return `All ${schedule.eligibleCount} scheduled daily puzzles have been used.`;
}

async function copyResult() {
  const text = buildShareText();

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Result copied to clipboard.", "success");
  } catch (error) {
    setStatus("Couldn't copy automatically. Copy the text below manually.", "error");
  }
}
