// --- 1. STATE MANAGEMENT ---
let allActs = [];
let currentDate = 'All'; // Initial state before dynamic render
let currentStage = 'All';
let searchQuery = '';
let showFavoritesOnly = false;
let showSeenOnly = false; // Filter by seen acts

// Load stored favorite & seen act IDs from browser storage (Offline Ready)
const STORAGE_KEY_FAVS = 'gm2026_favorites';
const STORAGE_KEY_SEEN = 'gm2026_seen';
const STORAGE_KEY_LAST_MOD = 'gm2026_last_modified';

let favorites = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_FAVS) || '[]'));
let seenActs = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_SEEN) || '[]'));

// --- 2. DOM ELEMENTS ---
const actListEl = document.getElementById('act-list');
const searchInputEl = document.getElementById('search-input');
const favToggleBtn = document.getElementById('fav-toggle');
const seenToggleBtn = document.getElementById('seen-toggle');
const themeToggleBtn = document.getElementById('theme-toggle');
const refreshCacheBtn = document.getElementById('refresh-cache-btn');

const THEME_KEY = 'gm2026_theme';

// Global configuration order map for sorting days chronologically
const dayOrder = {
  'thursday': 1,
  'friday': 2,
  'saturday': 3,
  'sunday': 4,
  'monday': 5
};

// --- 3. INIT & DATA FETCH ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initServiceWorker();
  fetchScheduleData();
  setupEventListeners();
});

async function fetchScheduleData() {
  try {
    const response = await fetch('./data/gm2026.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const rawClashfinderData = await response.json();
    
    // Process Clashfinder structure into a flat array of acts
    allActs = parseClashfinderJSON(rawClashfinderData);
    updateFooterTimestamp(rawClashfinderData);
    
    // Dynamically render day buttons and determine smart default day
    currentDate = renderDaySelector(allActs, currentDate);
    
    populateStageDropdown();
    renderSchedule();
  } catch (err) {
    console.error('Error loading schedule:', err);
    if (actListEl) {
      actListEl.innerHTML = `<p class="error text-center p-3 text-danger">Failed to load schedule. Ensure ./data/gm2026.json exists.</p>`;
    }
  }
}

// --- CLASHFINDER PARSER ---
function parseClashfinderJSON(cfData) {
  const acts = [];
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const locations = cfData?.locations || cfData?.event?.locations || [];

  locations.forEach(location => {
    const stageName = location.name;
    const events = location.events || location.acts || [];

    events.forEach(event => {
      const actName = event.name || event.act || 'TBA';
      const startDateTime = event.start || '';
      const endDateTime = event.end || '';

      // Extract Day of Week from start timestamp (YYYY-MM-DD HH:MM)
      let dayName = 'Unknown';
      if (startDateTime) {
        const dateObj = new Date(startDateTime.replace(' ', 'T'));
        if (!isNaN(dateObj.getTime())) {
          dayName = daysOfWeek[dateObj.getDay()];
        }
      }

      // Format Start/End times to HH:MM format
      const startTime = startDateTime.split(' ')[1] || startDateTime;
      const endTime = endDateTime.split(' ')[1] || endDateTime;

      const cleanShort = String(event.short || actName)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      const actId = `act-${cleanShort}`;

      acts.push({
        id: actId,
        act: actName,
        stage: stageName,
        day: dayName,
        start: startTime,
        end: endTime,
        rawStart: startDateTime,
        rawEnd: endDateTime
      });
    });
  });

  return acts;
}

// --- DYNAMIC DAY SELECTOR & SMART DEFAULT ---
function renderDaySelector(acts, currentSelectedDay = null) {
  const container = document.getElementById('day-selector-container');
  if (!container) return 'All';

  const uniqueDays = [...new Set(acts.map(a => String(a.day || '').trim().toLowerCase()))]
    .filter(day => day !== '')
    .sort((a, b) => (dayOrder[a] || 99) - (dayOrder[b] || 99));

  if (uniqueDays.length === 0) return 'All';

  const activeDay = currentSelectedDay || getDefaultDate(uniqueDays, acts);

  let html = `
    <input type="radio" class="btn-check" name="day-radio" id="day-all" value="All" ${activeDay === 'All' ? 'checked' : ''}>
    <label class="btn btn-outline-success btn-sm" for="day-all">All</label>
  `;

  uniqueDays.forEach(dayName => {
    const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    const shortLabel = capitalized.substring(0, 3);
    const isChecked = activeDay.toLowerCase() === dayName ? 'checked' : '';

    html += `
      <input type="radio" class="btn-check" name="day-radio" id="day-${dayName}" value="${capitalized}" ${isChecked}>
      <label class="btn btn-outline-success btn-sm" for="day-${dayName}">${shortLabel}</label>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('input[name="day-radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentDate = e.target.value;
      renderSchedule();
    });
  });

  return activeDay;
}

function getDefaultDate(availableDays, acts) {
  // 🛡️ Safety check against TypeError: acts is not iterable
  if (!Array.isArray(acts) || acts.length === 0) {
    return 'All';
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  for (const act of acts) {
    if (act.rawStart && act.rawStart.startsWith(todayStr)) {
      const actDayLower = String(act.day || '').trim().toLowerCase();
      if (availableDays.includes(actDayLower)) {
        return act.day.charAt(0).toUpperCase() + act.day.slice(1);
      }
    }
  }

  return 'All';
}

// --- 4. RENDER LOGIC ---
function renderSchedule() {
  const filtered = allActs.filter(act => {
    const actId = getActId(act);

    const matchesDay = currentDate === 'All' || act.day.toLowerCase() === currentDate.toLowerCase();
    const matchesStage = currentStage === 'All' || act.stage === currentStage;
    const matchesSearch = act.act.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFav = !showFavoritesOnly || favorites.has(actId);
    const matchesSeen = !showSeenOnly || seenActs.has(actId);
    
    return matchesDay && matchesStage && matchesSearch && matchesFav && matchesSeen;
  });

  filtered.sort((a, b) => {
    const dayA = String(a.day || '').trim().toLowerCase();
    const dayB = String(b.day || '').trim().toLowerCase();

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
    const shortDay = (act.day || '').substring(0, 3);

    return `
      <div class="list-group-item d-flex align-items-center px-1 py-2 gap-2 ${isSeen ? 'bg-success-subtle' : ''} ${isFav ? 'border border-2 border-warning rounded' : 'border border-bottom rounded'}">
        
       <div class="flex-shrink-0 d-flex flex-column align-items-start gap-1">
        <span class="badge ${isSeen ? 'border border-1 border-secondary rounded bg-primary-subtle' : 'bg-primary-subtle'} text-primary fw-bold px-2 py-1 w-100">
          ${escapeHtml(shortDay)}
        </span>
        
        <span class="badge ${isSeen ? 'border border-1 border-secondary rounded bg-secondary-subtle' : 'bg-secondary-subtle'} text-body fw-semibold py-1 px-2">
          ${escapeHtml(act.start)} - ${escapeHtml(act.end)}
        </span>
      </div>
             
        <div class="flex-grow-1" style="min-width: 0;">
          <div class="h6 mb-0 text-wrap lh-sm fw-bold text-break">
            ${escapeHtml(act.act)}
          </div>
          <div class="small text-muted text-wrap mt-1">${escapeHtml(act.stage)}</div>
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

// Parse HH:MM into pure total minutes from midnight
function parseTimeForSort(timeStr) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(timeStr || ''));
  if (!m) return 0;

  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);

  return hh * 60 + mm; 
}

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
  if (searchInputEl) {
    searchInputEl.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderSchedule();
    });
  }

  if (favToggleBtn) {
    favToggleBtn.addEventListener('click', () => {
      showFavoritesOnly = !showFavoritesOnly;
      favToggleBtn.innerText = showFavoritesOnly ? '★' : '⚝';
      favToggleBtn.classList.toggle('btn-warning', showFavoritesOnly);
      favToggleBtn.classList.toggle('text-dark', showFavoritesOnly);
      renderSchedule();
    });
  }

  if (seenToggleBtn) {
    seenToggleBtn.addEventListener('click', () => {
      showSeenOnly = !showSeenOnly;
      seenToggleBtn.innerText = showSeenOnly ? '✅' : '🔲';
      seenToggleBtn.classList.toggle('btn-success', showSeenOnly);
      seenToggleBtn.classList.toggle('text-white', showSeenOnly);
      renderSchedule();
    });
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-bs-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  const scrollTopBtn = document.getElementById('scroll-top-btn');
  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToTop();
    });
  }

  // Refresh cache button listener with offline safeguard
  if (refreshCacheBtn) {
    refreshCacheBtn.addEventListener('click', async () => {
      try {
        refreshCacheBtn.disabled = true;
        refreshCacheBtn.innerHTML = `⏳ <span>Updating...</span>`;

        const response = await fetch(`./data/gm2026.json?t=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const rawClashfinderData = await response.json();
        
        // Check if the data has actually changed by comparing timestamps
        const modifiedTime = rawClashfinderData?.lastEdit || rawClashfinderData?.modified;
        const previousModTime = localStorage.getItem(STORAGE_KEY_LAST_MOD);
        
        const hasChanged = previousModTime !== modifiedTime;

        // Update footer timestamp normally (so the Last Updated label always stays accurate)
        updateFooterTimestamp(rawClashfinderData);
        allActs = parseClashfinderJSON(rawClashfinderData);
        renderSchedule();

        if (hasChanged) {
          refreshCacheBtn.innerHTML = `✅ <span>Updated!</span>`;
        } else {
          // Flash "Up to Date" on the button because nothing changed
          refreshCacheBtn.innerHTML = `✨ <span>Up to Date</span>`;
        }
      } catch (err) {
        console.warn('Network unavailable, keeping cached data:', err);
        refreshCacheBtn.innerHTML = `⚠️ <span>Offline</span>`;
      } finally {
        setTimeout(() => {
          refreshCacheBtn.disabled = false;
          refreshCacheBtn.innerHTML = `🔄 <span>Refresh</span>`;
        }, 3000);
      }
    });
  }


}

function populateStageDropdown() {
  const customOrder = [
    'mountain stage',
    'far out',
    'walled garden',
    'chai wallahs',
    'rising',
    'round the twist',
    'wishbone',
    'babbling tongues',
    'cinedrome'
  ];

  const rawStages = [...new Set(allActs.map(a => a.stage))];
  const sortedStages = rawStages.sort((a, b) => {
    const indexA = customOrder.indexOf(String(a).toLowerCase().trim());
    const indexB = customOrder.indexOf(String(b).toLowerCase().trim());
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  const stages = sortedStages.filter(s => String(s).toLowerCase() !== 'all');
  const checkedAll = currentStage === 'All' ? 'checked' : '';

  let html = `
    <div class="d-flex flex-wrap gap-1 w-100">
      <input type="radio" class="btn-check" name="stage-radio" id="stage-all" value="All" ${checkedAll}>
      <label class="btn btn-outline-primary btn-sm flex-fill text-nowrap text-center" for="stage-all">All</label>
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

  document.querySelectorAll('input[name="stage-radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        currentStage = e.target.value;
        renderSchedule();
      }
    });
  });
}

function escapeHtml(str) {
  const s = String(str == null ? '' : str);
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

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
  applyTheme((saved === 'light' || saved === 'dark') ? saved : 'light');
}

// Helper for ordinal suffixes (1st, 2nd, 3rd, 4th, etc.)
function getOrdinalSuffix(dayNum) {
  if (dayNum > 3 && dayNum < 21) return 'th';
  switch (dayNum % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function updateFooterTimestamp(data) {
  const lastUpdatedEl = document.getElementById('data-last-updated');
  if (!lastUpdatedEl) return;

  const modifiedTime = data?.lastEdit || data?.modified;

  if (modifiedTime) {
    const d = new Date(modifiedTime.replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }); 
      const dayNum = d.getDate(); 
      const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); 
      
      const formattedDate = `${weekday} ${dayNum}${getOrdinalSuffix(dayNum)} ${time}`;
      
      // Save it locally for the comparison logic in the refresh button
      localStorage.setItem(STORAGE_KEY_LAST_MOD, modifiedTime);
      
      // Always show the last modified date label cleanly
      lastUpdatedEl.innerHTML = `<span>Last updated:<br/>${formattedDate}</span>`;
      return;
    }
  }

  lastUpdatedEl.innerHTML = `<span>Last updated: Unknown</span>`;
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW Registered successfully:', reg.scope))
      .catch(err => console.error('SW Registration failed:', err));
  }
}