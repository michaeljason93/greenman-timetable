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
// Day selector is implemented as a group of radio inputs (see index.html)
const dayRadioEls = Array.from(document.querySelectorAll('input[name="day-radio"]'));
const stageFilterEl = document.getElementById('stage-filter');
const searchInputEl = document.getElementById('search-input');
const favToggleBtn = document.getElementById('fav-toggle');

// --- 3. INIT & DATA FETCH ---
document.addEventListener('DOMContentLoaded', () => {
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
  filtered.sort((a, b) => a.start.localeCompare(b.start));

  if (filtered.length === 0) {
    actListEl.innerHTML = `<div class="empty-state">No acts found for this selection.</div>`;
    return;
  }

  // Render cards
  actListEl.innerHTML = filtered.map(act => {
    const actId = getActId(act);
    const isFav = favorites.has(actId);

    return `
      <div class="act-card ${isFav ? 'is-favorite' : ''}">
        <div class="time-badge">${act.start} - ${act.end}</div>
        <div class="act-details">
          <h3 class="act-name">${escapeHtml(act.act)}</h3>
          <span class="stage-name">${escapeHtml(act.stage)}</span>
        </div>
        <button class="fav-btn" onclick="toggleFavorite('${actId}')" aria-label="Favorite">
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
  dayRadioEls.forEach(radio => radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      currentDay = e.target.value;
      renderSchedule();
    }
  }));

  // Stage Selector
  stageFilterEl.addEventListener('change', (e) => {
    currentStage = e.target.value;
    renderSchedule();
  });

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
}

function populateStageDropdown() {
  const stages = ['All', ...new Set(allActs.map(a => a.stage))];
  stageFilterEl.innerHTML = stages.map(stage => 
    `<option value="${stage}">${stage}</option>`
  ).join('');
}

// Helper to escape special characters in HTML strings
function escapeHtml(str) {
  const s = String(str == null ? '' : str);
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// --- 7. SERVICE WORKER REGISTRATION (OFFLINE SUPPORT) ---
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW Registered successfully:', reg.scope))
      .catch(err => console.error('SW Registration failed:', err));
  }
}