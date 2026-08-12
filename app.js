// --- 1. STATE MANAGEMENT ---
let allActs = [];
let currentDay = 'Thursday';
let currentStage = 'All';
let searchQuery = '';
let showFavoritesOnly = false;
let showSeenOnly = false; // Filter by seen acts

// Load stored favorite & seen act IDs from browser storage (Offline Ready)
const STORAGE_KEY_FAVS = 'gm2026_favorites';
const STORAGE_KEY_SEEN = 'gm2026_seen';

let favorites = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_FAVS) || '[]'));
let seenActs = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_SEEN) || '[]'));

// --- 2. DOM ELEMENTS ---
const actListEl = document.getElementById('act-list');

let dayRadioEls = [];
const searchInputEl = document.getElementById('search-input');
const favToggleBtn = document.getElementById('fav-toggle');
const seenToggleBtn = document.getElementById('seen-toggle'); // Add this button in index.html if desired
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
    const actId = getActId(act);
    const matchesDay = act.day === currentDay;
    const matchesStage = currentStage === 'All' || act.stage === currentStage;
    const matchesSearch = act.act.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFav = !showFavoritesOnly || favorites.has(actId);
    const matchesSeen = !showSeenOnly || seenActs.has(actId);
    
    return matchesDay && matchesStage && matchesSearch && matchesFav && matchesSeen;
  });

  // Sort chronologically by start time taking late night into account
  filtered.sort((a, b) => {
    const ta = parseTimeForSort(a.start);
    const tb = parseTimeForSort(b.start);
    return ta - tb;
  });

  if (filtered.length === 0) {
    actListEl.innerHTML = `<div class="empty-state p-3 text-center text-muted">No acts found for this selection.</div>`;
    return;
  }

  // Render cards
  // Render cards
  // Render cards
  actListEl.innerHTML = filtered.map(act => {
    const actId = getActId(act);
    const isFav = favorites.has(actId);
    const isSeen = seenActs.has(actId);

    return `
      <div class="list-group-item d-flex align-items-center p-2 gap-2 overflow-hidden ${isFav ? 'border border-2 border-warning rounded' : 'border border-bottom rounded'}">
        
        <div class="flex-shrink-0">
          <span class="badge ${isSeen ? 'border border-2 border-success bg-secondary-subtle' : 'bg-secondary-subtle'} text-body fw-semibold py-2 px-2">${act.start} - ${act.end}</span>
        </div>
        
        <div class="flex-grow-1" style="min-width: 0;">
          <div class="h6 mb-0 text-wrap lh-sm fw-bold text-break" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(act.act)} ${isSeen ? '✅' : ''}
          </div>
          <div class="small text-muted text-truncate mt-1">${escapeHtml(act.stage)}</div>
        </div>
        
        <div class="d-flex gap-1 align-items-center flex-shrink-0">
          <button class="btn btn-link btn-sm p-1 text-decoration-none ${isSeen ? 'text-success fw-bold' : 'text-secondary'}" 
                  onclick="toggleSeen('${actId}')" 
                  title="${isSeen ? 'Mark as Unseen' : 'Mark as Seen'}"
                  aria-label="Seen">
            ${isSeen ? '👁️' : '👁️‍🗨️'}
          </button>
          
          <button class="btn btn-link btn-sm p-1 fav-btn text-decoration-none ${isFav ? 'text-warning fs-5' : 'text-secondary fs-5'}" 
                  onclick="toggleFavorite('${actId}')" 
                  title="${isFav ? 'Remove Favorite' : 'Add Favorite'}"
                  aria-label="Favorite">
            ${isFav ? '★' : '☆'}
          </button>
        </div>

      </div>
    `;
  }).join('');
}

// Parse a HH:MM time string into minutes, treating early-morning times (00:00-05:59) as late night
function parseTimeForSort(timeStr) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(timeStr || ''));
  if (!m) return 0;
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);

  if (hh >= 0 && hh < 6) hh += 24;

  return hh * 60 + mm;
}

// Helper to construct or retrieve unique act ID
function getActId(act) {
  if (act.id) return act.id;
  return `${act.day}-${act.stage}-${act.start}-${act.act}`
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

// --- 5. FAVORITES & SEEN MANAGEMENT ---
window.toggleFavorite = function(actId) {
  if (favorites.has(actId)) {
    favorites.delete(actId);
  } else {
    favorites.add(actId);
  }
  
  localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(Array.from(favorites)));
  renderSchedule();
};

window.toggleSeen = function(actId) {
  if (seenActs.has(actId)) {
    seenActs.delete(actId);
  } else {
    seenActs.add(actId);
  }
  
  localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(Array.from(seenActs)));
  renderSchedule();
};

// --- 6. EVENT LISTENERS ---
function setupEventListeners() {
  // Day Selector (radio buttons)
  const checked = document.querySelector('input[name="day-radio"]:checked');
  if (checked) currentDay = checked.value;

  dayRadioEls = Array.from(document.querySelectorAll('input[name="day-radio"]'));
  dayRadioEls.forEach(radio => radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      currentDay = e.target.value;
      renderSchedule();
    }
  }));

  // Search Input
  if (searchInputEl) {
    searchInputEl.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderSchedule();
    });
  }

  // Favorites-Only Toggle Button
  if (favToggleBtn) {
    favToggleBtn.addEventListener('click', () => {
      showFavoritesOnly = !showFavoritesOnly;
      favToggleBtn.classList.toggle('active', showFavoritesOnly);
      favToggleBtn.innerText = showFavoritesOnly ? '★' : '☆';
      renderSchedule();
    });
  }

  // Seen-Only Toggle Button (Optional UI Filter)
  if (seenToggleBtn) {
    seenToggleBtn.addEventListener('click', () => {
      showSeenOnly = !showSeenOnly;
      seenToggleBtn.classList.toggle('active', showSeenOnly);
      seenToggleBtn.innerText = showSeenOnly ? '👁️' : '👁️‍🗨️';
      renderSchedule();
    });
  }

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
    <input type="radio" class="btn-check text-center" name="stage-radio" id="${idAll}" value="All" ${checkedAll}>
    <label class="btn btn-outline-primary btn-sm w-100 mb-0 text-center" for="${idAll}">All</label>
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

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW Registered successfully:', reg.scope))
      .catch(err => console.error('SW Registration failed:', err));
  }
}