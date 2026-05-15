const SPRITE_DIR = "assets/sprites";
const MINE_ASSETS = [
  { item: "yarn", sleeping: "cat-sleep-yarn.webp", trace: "item-yarn.webp" },
  { item: "fish", sleeping: "cat-sleep-fish.webp", trace: "item-fish.webp" },
  { item: "bow", sleeping: "cat-sleep-bow.webp", trace: "item-bow.webp" },
  { item: "bell", sleeping: "cat-sleep-bell.webp", trace: "item-bell.webp" },
  { item: "moon", sleeping: "cat-sleep-moon.webp", trace: "item-moon.webp" },
  { item: "star", sleeping: "cat-sleep-star.webp", trace: "item-star.webp" },
  { item: "cube", sleeping: "cat-sleep-cube.webp", trace: "item-cube.webp" },
];
const AWAKE_CATS = ["cat-awake-gray.webp", "cat-awake-orange.webp", "cat-awake-black.webp"];
const PRELOAD_ASSETS = [
  "tile-closed.webp",
  "tile-open.webp",
  "tile-trace.webp",
  "badge-sleep.webp",
  "badge-awake.webp",
  ...MINE_ASSETS.flatMap((asset) => [asset.sleeping, asset.trace]),
  ...AWAKE_CATS,
];

const dateKey = getDateKey();
const dayNumber = getDayNumber(dateKey);
const game = createGame();

const els = {
  dayNumber: document.querySelector("#day-number"),
  dayDate: document.querySelector("#day-date"),
  board: document.querySelector("#mines-board"),
  status: document.querySelector("#mines-status"),
  helpButton: document.querySelector("#help-button"),
  helpModal: document.querySelector("#help-modal"),
  resultModal: document.querySelector("#result-modal"),
  resultTitle: document.querySelector("#result-title"),
  resultText: document.querySelector("#result-text"),
  statsGrid: document.querySelector("#stats-grid"),
  resultCats: document.querySelector("#result-cats"),
  sharePreview: document.querySelector("#share-preview"),
  gameLink: document.querySelector("#game-link"),
  shareResult: document.querySelector("#share-result"),
};

els.dayNumber.textContent = `#${dayNumber}`;
els.dayDate.textContent = formatDate(dateKey);
preloadSprites();
bindModals();
render();
window.setTimeout(() => {
  if (!game.done && !els.helpModal.open) els.helpModal.showModal();
}, 250);

els.shareResult.addEventListener("click", async () => {
  const text = buildShareText();
  try {
    await navigator.clipboard.writeText(text);
    els.shareResult.textContent = "Скопировано";
  } catch {
    window.prompt("Скопируйте результат:", text);
  }
  window.setTimeout(() => {
    els.shareResult.textContent = "Скопировать результат";
  }, 1500);
});

function bindModals() {
  els.helpButton.addEventListener("click", () => els.helpModal.showModal());
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  [els.helpModal, els.resultModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.close();
    });
  });
}

function createGame() {
  const rng = mulberry32(hashString(`${dateKey}:traces`));
  const rows = 6;
  const cols = 4;
  const total = rows * cols;
  const catCount = 5;
  const generatedCats = shuffle([...Array(total).keys()], rng).slice(0, catCount).map((index, itemIndex) => ({
    index,
    asset: MINE_ASSETS[itemIndex],
    awake: AWAKE_CATS[itemIndex % AWAKE_CATS.length],
  }));
  const savedRaw = readState();
  const legacyState = savedRaw.marked || savedRaw.tool || savedRaw.started || savedRaw.cats?.some((cat) => typeof cat === "number");
  const saved = legacyState ? {} : savedRaw;
  const cats = normalizeCats(saved.cats ?? generatedCats);
  const opened = new Set(saved.opened ?? []);

  return {
    rows,
    cols,
    cats,
    opened,
    sleepy: saved.sleepy ?? 3,
    done: saved.done ?? false,
  };
}

function render() {
  renderBoard();
  renderResult();
}

function renderBoard() {
  els.board.innerHTML = "";
  const safeTotal = game.rows * game.cols - game.cats.length;
  const openSafe = [...game.opened].filter((index) => !catAt(index)).length;
  game.done = game.done || openSafe === safeTotal || game.sleepy <= 0;
  els.status.textContent = game.done
    ? openSafe === safeTotal ? "решено" : "коты проснулись"
    : `${game.sleepy}/3`;

  for (let index = 0; index < game.rows * game.cols; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tile";
    const opened = game.opened.has(index);
    const cat = catAt(index);
    button.disabled = game.done || opened;

    if (!opened) {
      if (game.done && cat) {
        button.classList.add("open");
        button.innerHTML = spriteImg(cat.asset.sleeping, "Спящий кот");
      } else {
        button.classList.add("hidden-tile");
        button.innerHTML = spriteImg("tile-closed.webp", "Закрытая подушка", "asset-image tile-background");
      }
    } else if (cat) {
      button.classList.add("cat");
      button.innerHTML = spriteImg(cat.awake, "Проснувшийся кот");
    } else {
      button.classList.add("open");
      const traces = neighborItems(index);
      if (traces.length) {
        button.classList.add("traces");
        button.innerHTML = `${spriteImg("tile-trace.webp", "Подушка со следами", "tile-background")}<span class="trace-icons">${traces.map((asset) => spriteImg(asset.trace, "Вещь кота")).join("")}</span>`;
      } else {
        button.innerHTML = spriteImg("tile-open.webp", "Пустая подушка", "asset-image tile-background");
      }
    }

    button.addEventListener("click", () => openTile(index));
    els.board.append(button);
  }
}

function openTile(index) {
  if (game.done || game.opened.has(index)) return;
  game.opened.add(index);
  if (catAt(index)) game.sleepy -= 1;
  persist();
  render();
}

function renderResult() {
  if (!game.done) return;

  const stats = recordStatsOnce();
  const mood = moodStats();
  els.resultTitle.textContent = game.sleepy > 0 ? "Подушки открыты" : "Коты проснулись";
  els.resultText.textContent = `Спят: ${mood.sleeping} 😺, проснулись: ${mood.awake} 😾.`;
  els.statsGrid.innerHTML = `
    <div class="stat-card"><strong>${stats.played}</strong><span>игр</span></div>
    <div class="stat-card"><strong>${stats.wins}</strong><span>побед</span></div>
    <div class="stat-card"><strong>${stats.currentStreak}</strong><span>стрик</span></div>
    <div class="stat-card"><strong>${stats.maxStreak}</strong><span>лучший</span></div>
  `;
  els.resultCats.innerHTML = "";
  game.cats.forEach((cat) => {
    const awakened = game.opened.has(cat.index);
    const img = document.createElement("img");
    img.src = `${SPRITE_DIR}/${awakened ? cat.awake : cat.asset.sleeping}`;
    img.alt = "";
    els.resultCats.append(img);
  });
  els.gameLink.href = getGameUrl();
  els.gameLink.textContent = getGameUrl();
  els.sharePreview.textContent = buildShareText();
  if (!els.resultModal.open) els.resultModal.showModal();
}

function buildShareText() {
  const mood = moodStats();
  const stats = readStats();
  return [
    `Pillow Paws #${dayNumber}`,
    game.sleepy > 0 ? "Решено" : "Коты проснулись",
    `${"😺".repeat(mood.sleeping)}${"😾".repeat(mood.awake)}`,
    `🔥 Стрик: ${stats.currentStreak}`,
    `📊 Победы: ${stats.wins}/${stats.played}`,
    getGameUrl(),
  ].join("\n");
}

function recordStatsOnce() {
  const stats = readStats();
  if (stats.lastPlayedDate === dateKey) return stats;

  const won = game.sleepy > 0;
  stats.played += 1;
  if (won) {
    stats.wins += 1;
    stats.currentStreak = stats.lastWinDate === previousDateKey(dateKey) ? stats.currentStreak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    stats.lastWinDate = dateKey;
  } else {
    stats.currentStreak = 0;
  }
  stats.lastPlayedDate = dateKey;
  localStorage.setItem("kotoTraces:stats:v1", JSON.stringify(stats));
  return stats;
}

function readStats() {
  try {
    return {
      played: 0,
      wins: 0,
      currentStreak: 0,
      maxStreak: 0,
      lastPlayedDate: null,
      lastWinDate: null,
      ...JSON.parse(localStorage.getItem("kotoTraces:stats:v1")),
    };
  } catch {
    return {
      played: 0,
      wins: 0,
      currentStreak: 0,
      maxStreak: 0,
      lastPlayedDate: null,
      lastWinDate: null,
    };
  }
}

function previousDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const prevYear = date.getFullYear();
  const prevMonth = String(date.getMonth() + 1).padStart(2, "0");
  const prevDay = String(date.getDate()).padStart(2, "0");
  return `${prevYear}-${prevMonth}-${prevDay}`;
}

function getGameUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function moodStats() {
  const awake = game.cats.filter((cat) => game.opened.has(cat.index)).length;
  return {
    awake,
    sleeping: game.cats.length - awake,
  };
}

function neighborIndexes(index) {
  const row = Math.floor(index / game.cols);
  const col = index % game.cols;
  const result = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < game.rows && nc >= 0 && nc < game.cols) {
        result.push(nr * game.cols + nc);
      }
    }
  }
  return result;
}

function neighborItems(index) {
  return neighborIndexes(index)
    .map((nextIndex) => catAt(nextIndex)?.asset)
    .filter(Boolean);
}

function catAt(index) {
  return game.cats.find((cat) => cat.index === index);
}

function normalizeCats(cats) {
  return cats.map((cat, itemIndex) => ({
    ...cat,
    asset: cat.asset ?? MINE_ASSETS[itemIndex % MINE_ASSETS.length],
    awake: cat.awake ?? AWAKE_CATS[itemIndex % AWAKE_CATS.length],
  }));
}

function spriteImg(file, alt, className = "asset-image") {
  return `<img class="${className}" src="${SPRITE_DIR}/${file}" alt="${alt}">`;
}

function preloadSprites() {
  [...new Set(PRELOAD_ASSETS)].forEach((file) => {
    const img = new Image();
    img.src = `${SPRITE_DIR}/${file}`;
  });
}

function readState() {
  try {
    return JSON.parse(localStorage.getItem(`kotoTraces:v4:${dateKey}`)) ?? {};
  } catch {
    return {};
  }
}

function persist() {
  localStorage.setItem(`kotoTraces:v4:${dateKey}`, JSON.stringify({
    cats: game.cats,
    opened: [...game.opened],
    sleepy: game.sleepy,
    done: game.done,
  }));
}

function shuffle(list, rng) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayNumber(value) {
  const start = Date.UTC(2026, 0, 1);
  const [year, month, day] = value.split("-").map(Number);
  const current = Date.UTC(year, month - 1, day);
  return Math.max(1, Math.floor((current - start) / 86400000) + 1);
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
