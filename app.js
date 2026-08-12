// --- 1. STATE MANAGEMENT ---
let allActs = [];
let currentDay = 'Thursday';
let currentDate = 'All';
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

    const actDayVal = act.date || act.day; 
    const matchesDay = currentDate === 'All' || actDayVal === currentDate;
    const matchesStage = currentStage === 'All' || act.stage === currentStage;
    const matchesSearch = act.act.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFav = !showFavoritesOnly || favorites.has(actId);
    const matchesSeen = !showSeenOnly || seenActs.has(actId);
    
    return matchesDay && matchesStage && matchesSearch && matchesFav && matchesSeen;
  });

  const dayOrder = {
    'thursday': 1,
    'friday': 2,
    'saturday': 3,
    'sunday': 4
  };

  filtered.sort((a, b) => {
    const dayA = String(a.date || a.day || '').trim().toLowerCase();
    const dayB = String(b.date || b.day || '').trim().toLowerCase();

    const rankA = dayOrder[dayA] || 999;
    const rankB = dayOrder[dayB] || 999;

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    const timeA = parseTimeForSort(a.start);
    const timeB = parseTimeForSort(b.start);

    return timeA - timeB;
  });

  if (filtered.length === 0) {
    actListEl.innerHTML = `<div class="empty-state p-3 text-center text-muted">No acts found for this selection.</div>`;
    return;
  }

  actListEl.innerHTML = filtered.map(act => {
  const actId = getActId(act);
  const isFav = favorites.has(actId);
  const isSeen = seenActs.has(actId);
  
  // Format day string (e.g., "Thursday" -> "Thu")
  const actDay = (act.date || act.day || '');
  const shortDay = actDay.substring(0, 3);

  return `
    <div class="list-group-item d-flex align-items-center px-1 py-2 gap-2 overflow-hidden ${isSeen ? 'bg-success-subtle' : ''} ${isFav ? 'border border-2 border-warning rounded' : 'border border-bottom rounded'}">
      
      <div class="flex-shrink-0 d-flex flex-column align-items-start gap-1">
        ${currentDate === 'All' ? `<span class="badge ${isSeen ? 'border border-1 border-secondary rounded bg-primary-subtle' : 'bg-primary-subtle'} text-primary fw-bold px-2 py-1 w-100">${escapeHtml(shortDay)}</span>` : ''}
        
        <span class="badge ${isSeen ? 'border border-1 border-secondary rounded bg-secondary-subtle' : 'bg-secondary-subtle'} text-body fw-semibold py-1 px-2">
          ${escapeHtml(act.start)} - ${escapeHtml(act.end)}
        </span>
      </div>
      
      <div class="flex-grow-1" style="min-width: 0;">
        <div class="h6 mb-0 text-wrap lh-sm fw-bold text-break" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${escapeHtml(act.act)}
        </div>
        <div class="small text-muted text-truncate mt-1">${escapeHtml(act.stage)}</div>
      </div>
      
      <div class="d-flex gap-1 align-items-center flex-shrink-0">
        <button class="btn btn-link btn-sm p-1 text-decoration-none" 
                onclick="toggleSeen('${actId}')" 
                title="${isSeen ? 'Mark as Unseen' : 'Mark as Seen'}"
                aria-label="Seen">
          ${isSeen ? '✅' : '🔲'}
        </button>
        
        <button class="btn btn-link btn-sm p-1 fav-btn text-decoration-none ${isFav ? 'text-warning fs-5' : 'text-secondary fs-5'}" 
                onclick="toggleFavorite('${actId}')" 
                title="${isFav ? 'Remove Favorite' : 'Add Favorite'}"
                aria-label="Favorite">
          ${isFav ? '★' : '⚝'}
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
  if (checked) currentDate = checked.value;

  dayRadioEls = Array.from(document.querySelectorAll('input[name="day-radio"]'));
  dayRadioEls.forEach(radio => radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      currentDate = e.target.value; 
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
  // Favorites-Only Toggle Button
  if (favToggleBtn) {
    favToggleBtn.addEventListener('click', () => {
      showFavoritesOnly = !showFavoritesOnly;
      
      // Update icon
      favToggleBtn.innerText = showFavoritesOnly ? '★' : '⚝';

      // Toggle styles: Transparent Outline -> Solid Yellow
      if (showFavoritesOnly) {
        favToggleBtn.classList.add('btn-warning', 'text-dark');
      } else {
        favToggleBtn.classList.remove('btn-warning', 'text-dark');
      }

      renderSchedule();
    });
  }

  // Seen-Only Toggle Button
  if (seenToggleBtn) {
    seenToggleBtn.addEventListener('click', () => {
      showSeenOnly = !showSeenOnly;

      // Update icon
      seenToggleBtn.innerText = showSeenOnly ? '✅' : '🔲';

      // Toggle styles: Outline (transparent bg) -> Solid Green
      if (showSeenOnly) {
        seenToggleBtn.classList.add('btn-success', 'text-white');
      } else {
        seenToggleBtn.classList.remove('btn-success', 'text-white');
      }

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
  // 1. Define your exact desired order (case-insensitive mapping)
  const customOrder = [
    'mountain stage',
    'far out',
    'walled garden',
    'chai wallahs',
    'round the twist',
    'wishbone',
    'cinedrome'
  ];

  // 2. Extract unique stages from dataset
  const rawStages = [...new Set(allActs.map(a => a.stage))];

  // 3. Sort stages using customOrder indexes
  const sortedStages = rawStages.sort((a, b) => {
    const indexA = customOrder.indexOf(String(a).toLowerCase().trim());
    const indexB = customOrder.indexOf(String(b).toLowerCase().trim());

    // If a stage isn't in customOrder list, place it at the end
    const rankA = indexA === -1 ? 999 : indexA;
    const rankB = indexB === -1 ? 999 : indexB;

    return rankA - rankB;
  });

  // Ensure "All" is always first
  const stages = sortedStages.filter(s => String(s).toLowerCase() !== 'all');

  const idAll = 'stage-all';
  const checkedAll = currentStage === 'All' ? 'checked' : '';

  let html = `
    <div class="d-flex flex-wrap gap-1 w-100">
      <input type="radio" class="btn-check" name="stage-radio" id="${idAll}" value="All" ${checkedAll}>
      <label class="btn btn-outline-primary btn-sm flex-fill text-nowrap text-center" for="${idAll}">All</label>
  `;

  stages.forEach(stage => {
    const slug = String(stage).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    const id = `stage-${slug}`;
    const checked = stage === currentStage ? 'checked' : '';
    
    html += `
      <input type="radio" class="btn-check" name="stage-radio" id="${id}" value="${stage}" ${checked}>
      <label class="btn btn-outline-primary btn-sm flex-fill text-nowrap text-center" for="${id}">${stage}</label>
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