// --- 1. STATE MANAGEMENT ---
let allActs = [];
let currentDay = 'Thursday';
let currentStage = 'All';
let searchQuery = '';
let showFavoritesOnly = false;

// Load stored favorite act IDs from browser storage (Offline Ready)
const STORAGE_KEY = 'gm2026_favorites';
let favorites = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));

// --- 2. DOM ELEMENTS ---
const actListEl = document.getElementById('act-list');

let dayRadioEls = [];
const searchInputEl = document.getElementById('search-input');
const favToggleBtn = document.getElementById('fav-toggle');
const themeToggleBtn = document.getElementById('theme-toggle');

const THEME_KEY = 'gm2026_theme';

// --- 3. INIT & DATA FETCH ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initServiceWorker();
  fetchScheduleData();
  setupEventListeners();
});

async function fetchScheduleData() {
  try {
    const response = await fetch('./data.json');
    allActs = await response.json();
    populateStageDropdown();
    renderSchedule();
  } catch (err) {
    console.error('Error loading schedule:', err);
    actListEl.innerHTML = `<p class="error">Failed to load schedule. Ensure data.json exists.</p>`;
  }
}

// --- 4. RENDER LOGIC ---
function renderSchedule() {
  // Filter dataset based on active UI states
  const filtered = allActs.filter(act => {
    const matchesDay = act.day === currentDay;
    const matchesStage = currentStage === 'All' || act.stage === currentStage;
    const matchesSearch = act.act.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFav = !showFavoritesOnly || favorites.has(getActId(act));
    
    return matchesDay && matchesStage && matchesSearch && matchesFav;
  });

  // Sort chronologically by start time
  // Sort taking into account post-midnight acts (treat times between 00:00-05:59 as belonging to the previous day)
  filtered.sort((a, b) => {
    const ta = parseTimeForSort(a.start);
    const tb = parseTimeForSort(b.start);
    return ta - tb;
  });

  if (filtered.length === 0) {
    actListEl.innerHTML = `<div class="empty-state">No acts found for this selection.</div>`;
    return;
  }

// Parse a HH:MM time string into minutes, but treat early-morning times as after 24:00
function parseTimeForSort(timeStr) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(timeStr || ''));
  if (!m) return 0;
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);

  // Consider acts starting before 06:00 as 'late-night' of the previous day
  if (hh >= 0 && hh < 6) hh += 24;

  return hh * 60 + mm;
}

  // Render cards
  actListEl.innerHTML = filtered.map(act => {
    const actId = getActId(act);
    const isFav = favorites.has(actId);

    return `
      <div class="list-group-item d-flex align-items-center gap-3 ${isFav ? 'border border-3 border-warning' : ''}">
        <div class="me-2">
          <span class="badge bg-info text-dark fw-semibold py-2 px-3">${act.start} - ${act.end}</span>
        </div>
        <div class="flex-grow-1">
          <div class="h6 mb-0">${escapeHtml(act.act)}</div>
          <div class="small text-muted">${escapeHtml(act.stage)}</div>
        </div>
        <button class="btn btn-link btn-sm fav-btn" onclick="toggleFavorite('${actId}')" aria-label="Favorite">
          ${isFav ? '★' : '☆'}
        </button>
      </div>
    `;
  }).join('');
}

// Helper to construct or retrieve unique act ID
function getActId(act) {
  if (act.id) return act.id;
  return `${act.day}-${act.stage}-${act.start}-${act.act}`
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

// --- 5. FAVORITES MANAGEMENT ---
window.toggleFavorite = function(actId) {
  if (favorites.has(actId)) {
    favorites.delete(actId);
  } else {
    favorites.add(actId);
  }
  
  // Save set array to localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(favorites)));
  renderSchedule();
};

// --- 6. EVENT LISTENERS ---
function setupEventListeners() {
  // Day Selector (radio buttons)
  // initialize currentDay from checked radio
  const checked = document.querySelector('input[name="day-radio"]:checked');
  if (checked) currentDay = checked.value;

  // Re-query day radio elements now that DOM is ready
  dayRadioEls = Array.from(document.querySelectorAll('input[name="day-radio"]'));
  dayRadioEls.forEach(radio => radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      currentDay = e.target.value;
      renderSchedule();
    }
  }));

  // Stage radios are wired when populateStageDropdown runs (after data is loaded)

  // Search Input
  searchInputEl.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderSchedule();
  });

  // Favorites-Only Toggle Button
  favToggleBtn.addEventListener('click', () => {
    showFavoritesOnly = !showFavoritesOnly;
    favToggleBtn.classList.toggle('active', showFavoritesOnly);
    favToggleBtn.innerText = showFavoritesOnly ? '★ Showing Starred' : '☆ Starred Only';
    renderSchedule();
  });

  // Theme toggle
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-bs-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }
}

function populateStageDropdown() {
  const stages = ['All', ...new Set(allActs.map(a => a.stage))];
  const others = stages.slice(1);
  const idAll = 'stage-all';
  const checkedAll = currentStage === 'All' ? 'checked' : '';

  let html = `
    <input type="radio" class="btn-check" name="stage-radio" id="${idAll}" value="All" ${checkedAll}>
    <label class="btn btn-outline-primary btn-sm w-100 mb-2 text-start" for="${idAll}">All</label>
    <div class="d-flex flex-wrap gap-2 w-100">
  `;

  others.forEach(stage => {
    const slug = String(stage).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    const id = `stage-${slug}`;
    const checked = stage === currentStage ? 'checked' : '';
    html += `
      <input type="radio" class="btn-check" name="stage-radio" id="${id}" value="${stage}" ${checked}>
      <label class="btn btn-outline-primary btn-sm flex-fill text-truncate" for="${id}">${stage}</label>
    `;
  });

  html += `</div>`;

  const stageGroupEl = document.getElementById('stage-group');
  if (!stageGroupEl) return;
  stageGroupEl.innerHTML = html;

  const stageRadioEls = Array.from(document.querySelectorAll('input[name="stage-radio"]'));
  stageRadioEls.forEach(radio => radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      currentStage = e.target.value;
      renderSchedule();
    }
  }));
}

// Helper to escape special characters in HTML strings
function escapeHtml(str) {
  const s = String(str == null ? '' : str);
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// --- THEME HANDLING ---
function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-bs-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  if (themeToggleBtn) {
    themeToggleBtn.innerText = t === 'dark' ? '🌙' : '☀️';
    themeToggleBtn.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const initial = (saved === 'light' || saved === 'dark') ? saved : 'light';
  applyTheme(initial);
}

// --- 7. SERVICE WORKER REGISTRATION (OFFLINE SUPPORT) ---
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW Registered successfully:', reg.scope))
      .catch(err => console.error('SW Registration failed:', err));
  }
}