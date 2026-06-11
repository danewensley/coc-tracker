// ── Config ──────────────────────────────────────────────────────────────────

const PLAYER_TAGS = [
  '#YRCCU8RQ9',
  '#8GLRVQQVJ',
  '#QP08YGUY',
  '#9LP92Y9CY',
  '#YCQV00J0P',
  '#QU99UQLRU',
];

const COC_API = 'https://api.clashofclans.com/v1';

const DARK_TROOPS = new Set([
  'Minion', 'Hog Rider', 'Valkyrie', 'Golem', 'Witch', 'Lava Hound',
  'Bowler', 'Ice Golem', 'Headhunter', 'Apprentice Warden', 'Druid',
  'Super Minion', 'Super Valkyrie', 'Ice Hound', 'Super Bowler', 'Super Hog Rider',
]);

const SIEGE_MACHINES = new Set([
  'Wall Wrecker', 'Battle Blimp', 'Stone Slammer', 'Siege Barracks',
  'Log Launcher', 'Flame Flinger', 'Battle Drill',
]);

const SUPER_TROOPS = new Set([
  'Super Barbarian', 'Sneaky Goblin', 'Super Giant', 'Rocket Balloon',
  'Super Wizard', 'Super Dragon', 'Inferno Dragon', 'Sneaky Archer',
  'Super Wall Breaker', 'Super Archer', 'Super Miner', 'Super Witch',
  'Super Valkyrie', 'Super Bowler', 'Super Hog Rider', 'Ice Hound',
  'Super Minion',
]);

const DARK_SPELLS = new Set([
  'Poison Spell', 'Earthquake Spell', 'Haste Spell', 'Bat Spell', 'Skeleton Spell',
]);

const TABS = [
  { id: 'defenses', label: 'Defenses' },
  { id: 'troops', label: 'Troops' },
  { id: 'dark', label: 'Dark Troops' },
  { id: 'spells', label: 'Spells' },
  { id: 'sieges', label: 'Sieges' },
  { id: 'heroes', label: 'Heroes' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'walls', label: 'Walls' },
  { id: 'builders', label: 'Builders' },
  { id: 'lab', label: 'Lab' },
  { id: 'stats', label: 'Stats' },
];

// Wall counts per TH level (number of wall segments, approximate)
const WALL_COUNTS = {
  1: 25, 2: 25, 3: 50, 4: 75, 5: 100, 6: 125, 7: 150, 8: 175,
  9: 200, 10: 225, 11: 250, 12: 275, 13: 300, 14: 325, 15: 350, 16: 375,
};

// ── State ────────────────────────────────────────────────────────────────────

let state = {
  apiKey: '',
  players: {},      // tag -> { data, error, loading, lastFetched }
  view: 'overview', // 'overview' | 'detail'
  detailTag: null,
  detailTab: 'defenses',
  globalLoading: false,
};

// ── API ──────────────────────────────────────────────────────────────────────

async function fetchPlayer(tag) {
  const encoded = encodeURIComponent(tag);
  const res = await fetch(`${COC_API}/players/${encoded}`, {
    headers: { Authorization: `Bearer ${state.apiKey}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function refreshAll() {
  if (state.globalLoading) return;
  state.globalLoading = true;

  PLAYER_TAGS.forEach(tag => {
    state.players[tag] = { ...state.players[tag], loading: true, error: null };
  });
  render();

  await Promise.all(PLAYER_TAGS.map(async tag => {
    try {
      const data = await fetchPlayer(tag);
      state.players[tag] = { data, loading: false, error: null, lastFetched: Date.now() };
    } catch (e) {
      state.players[tag] = { ...state.players[tag], loading: false, error: e.message };
    }
  }));

  state.globalLoading = false;
  render();
}

async function refreshOne(tag) {
  state.players[tag] = { ...state.players[tag], loading: true, error: null };
  render();
  try {
    const data = await fetchPlayer(tag);
    state.players[tag] = { data, loading: false, error: null, lastFetched: Date.now() };
  } catch (e) {
    state.players[tag] = { ...state.players[tag], loading: false, error: e.message };
  }
  render();
}

// ── Data helpers ─────────────────────────────────────────────────────────────

function homeTroops(data) {
  return (data.troops || []).filter(t => t.village === 'home' && !SUPER_TROOPS.has(t.name));
}

function categorize(data) {
  const troops = homeTroops(data);
  return {
    regular: troops.filter(t => !DARK_TROOPS.has(t.name) && !SIEGE_MACHINES.has(t.name)),
    dark: troops.filter(t => DARK_TROOPS.has(t.name) && !SIEGE_MACHINES.has(t.name)),
    sieges: troops.filter(t => SIEGE_MACHINES.has(t.name)),
    spells: (data.spells || []).filter(t => t.village === 'home'),
    heroes: (data.heroes || []).filter(h => h.village === 'home'),
    equipment: (data.heroEquipment || []).filter(e => e.village === 'home'),
    builderTroops: (data.troops || []).filter(t => t.village === 'builderBase'),
  };
}

function completion(items) {
  if (!items.length) return 100;
  const cur = items.reduce((s, i) => s + i.level, 0);
  const max = items.reduce((s, i) => s + i.maxLevel, 0);
  return max === 0 ? 100 : Math.round((cur / max) * 100);
}

function overallCompletion(data) {
  const cat = categorize(data);
  const all = [
    ...cat.regular, ...cat.dark, ...cat.sieges,
    ...cat.spells, ...cat.heroes, ...cat.equipment,
  ];
  return completion(all);
}

function lastFetchedLabel(ts) {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ── Render helpers ────────────────────────────────────────────────────────────

function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function html(str) {
  const d = document.createElement('div');
  d.innerHTML = str;
  return d.firstElementChild;
}

function pct(val) { return `${Math.min(100, Math.max(0, val))}%`; }

function itemRow(item) {
  const isDark = DARK_SPELLS.has(item.name);
  const isMaxed = item.level >= item.maxLevel;
  const fillPct = pct((item.level / item.maxLevel) * 100);

  return el('div', { class: 'item-row' },
    el('span', { class: 'item-name' }, item.name),
    isDark ? el('span', { class: 'badge-dark' }, 'Dark') : null,
    el('div', { class: 'item-bar' },
      el('div', { class: `item-bar-fill${isMaxed ? ' maxed' : ''}`, style: `width:${fillPct}` })
    ),
    el('span', { class: 'item-level' },
      el('span', { class: 'cur' }, String(item.level)),
      el('span', { class: 'sep' }, '/'),
      el('span', { class: 'max' }, String(item.maxLevel)),
    ),
    isMaxed ? el('span', { class: 'badge-maxed' }, 'MAX') : null,
  );
}

function progressBar(value, isMaxed = false) {
  const p = el('div', { class: 'progress-wrap' });
  p.innerHTML = `
    <div class="progress-label">
      <span>Overall</span>
      <span class="progress-pct">${value}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill${isMaxed ? ' maxed' : ''}" style="width:${value}%"></div>
    </div>`;
  return p;
}

// ── Views ─────────────────────────────────────────────────────────────────────


function renderSetup() {
  const form = el('div', { class: 'setup-form' },
    el('input', {
      type: 'text', id: 'api-key-input',
      placeholder: 'Bearer token from developer.clashofclans.com',
      autocomplete: 'off', spellcheck: 'false',
    }),
    el('button', {
      class: 'btn btn-primary',
      onclick() {
        const key = document.getElementById('api-key-input').value.trim();
        if (!key) return;
        state.apiKey = key;
        localStorage.setItem('coc_api_key', key);
        refreshAll();
        render();
      },
    }, 'Connect →'),
  );
  return el('div', { class: 'setup-screen' },
    el('div', { class: 'setup-logo' }, '⚔️'),
    el('h1', {}, 'COC Tracker'),
    el('p', {}, 'Enter your API key from developer.clashofclans.com'),
    form,
  );
}

function renderOverview() {
  const cards = PLAYER_TAGS.map(tag => {
    const p = state.players[tag] || {};
    const card = el('div', {
      class: `village-card${p.loading ? ' loading' : ''}${p.error ? ' error' : ''}`,
      onclick() {
        if (p.data) {
          state.view = 'detail';
          state.detailTag = tag;
          state.detailTab = 'defenses';
          render();
          window.scrollTo(0, 0);
        }
      },
    });

    if (p.loading && !p.data) {
      card.innerHTML = `
        <div class="card-th"><span class="th-badge">TH ?</span><span class="card-name">Loading…</span></div>
        <div class="progress-wrap"><div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div></div>`;
      return card;
    }

    if (p.error && !p.data) {
      card.innerHTML = `
        <div class="card-th"><span class="th-badge">ERR</span><span class="card-name">${tag}</span></div>
        <div class="card-error">${p.error}</div>`;
      return card;
    }

    if (!p.data) {
      card.innerHTML = `<div class="card-th"><span class="card-name">${tag}</span></div>`;
      return card;
    }

    const d = p.data;
    const cat = categorize(d);
    const pctAll = overallCompletion(d);
    const pctHero = completion(cat.heroes);
    const pctTroop = completion([...cat.regular, ...cat.dark]);
    const pctSpell = completion(cat.spells);
    const maxedHeroes = cat.heroes.filter(h => h.level >= h.maxLevel).length;
    const isMaxed = pctAll >= 100;

    card.appendChild(
      el('div', { class: 'card-th' },
        el('span', { class: 'th-badge' }, `TH${d.townHallLevel}`),
        d.builderHallLevel
          ? el('span', { class: 'bh-badge' }, `BH${d.builderHallLevel}`)
          : null,
        el('span', { class: 'card-name' }, d.name),
      )
    );

    card.appendChild(
      el('div', { class: 'card-stats' },
        el('div', { class: 'stat-row' },
          el('span', {}, 'Heroes'),
          el('span', { class: `stat-val${pctHero === 100 ? ' good' : ''}` },
            `${maxedHeroes}/${cat.heroes.length} maxed`),
        ),
        el('div', { class: 'stat-row' },
          el('span', {}, 'Troops'),
          el('span', { class: `stat-val${pctTroop === 100 ? ' good' : ''}` }, `${pctTroop}%`),
        ),
        el('div', { class: 'stat-row' },
          el('span', {}, 'Spells'),
          el('span', { class: `stat-val${pctSpell === 100 ? ' good' : ''}` }, `${pctSpell}%`),
        ),
      )
    );

    card.appendChild(progressBar(pctAll, isMaxed));
    return card;
  });

  // find a last-fetched timestamp
  const fetched = Object.values(state.players)
    .map(p => p.lastFetched).filter(Boolean).sort().pop();

  return el('div', {},
    ...cards,
    fetched ? el('div', { class: 'last-updated' }, `Updated ${lastFetchedLabel(fetched)}`) : null,
  );
}

function renderDetailTab(data) {
  const tab = state.detailTab;
  const cat = categorize(data);

  if (tab === 'defenses') {
    return el('div', { class: 'tab-content' },
      el('div', { class: 'builders-note' },
        el('strong', {}, '⚠️ Building data not available'),
        document.createTextNode(' — The official Clash of Clans API does not expose individual building or defense levels. Only troop, spell, hero, and equipment data is accessible.'),
      ),
      el('div', { class: 'builders-note' },
        document.createTextNode(`Town Hall ${data.townHallLevel} unlocks all defenses for that level. Use the Stats tab for overall account info.`),
      ),
    );
  }

  if (tab === 'troops') {
    const items = cat.regular;
    if (!items.length) return el('div', { class: 'tab-content' }, el('p', { class: 'empty-tab' }, 'No troops found'));
    return el('div', { class: 'tab-content' },
      el('div', { class: 'item-list' }, ...items.map(itemRow)),
    );
  }

  if (tab === 'dark') {
    const items = cat.dark;
    if (!items.length) return el('div', { class: 'tab-content' }, el('p', { class: 'empty-tab' }, 'No dark troops found'));
    return el('div', { class: 'tab-content' },
      el('div', { class: 'item-list' }, ...items.map(itemRow)),
    );
  }

  if (tab === 'spells') {
    const reg = cat.spells.filter(s => !DARK_SPELLS.has(s.name));
    const dark = cat.spells.filter(s => DARK_SPELLS.has(s.name));
    return el('div', { class: 'tab-content' },
      reg.length ? el('div', { class: 'section-header' }, 'Regular Spells') : null,
      reg.length ? el('div', { class: 'item-list' }, ...reg.map(itemRow)) : null,
      dark.length ? el('div', { class: 'section-header' }, 'Dark Spells') : null,
      dark.length ? el('div', { class: 'item-list' }, ...dark.map(itemRow)) : null,
      (!reg.length && !dark.length) ? el('p', { class: 'empty-tab' }, 'No spells found') : null,
    );
  }

  if (tab === 'sieges') {
    const items = cat.sieges;
    if (!items.length) return el('div', { class: 'tab-content' }, el('p', { class: 'empty-tab' }, 'No siege machines unlocked'));
    return el('div', { class: 'tab-content' },
      el('div', { class: 'item-list' }, ...items.map(itemRow)),
    );
  }

  if (tab === 'heroes') {
    const home = cat.heroes;
    if (!home.length) return el('div', { class: 'tab-content' }, el('p', { class: 'empty-tab' }, 'No heroes found'));
    return el('div', { class: 'tab-content' },
      el('div', { class: 'item-list' }, ...home.map(itemRow)),
    );
  }

  if (tab === 'equipment') {
    const eq = cat.equipment;
    if (!eq.length) return el('div', { class: 'tab-content' }, el('p', { class: 'empty-tab' }, 'No equipment found'));

    // group by hero name using equipped items (API doesn't directly map equipment → hero, so we just list all)
    return el('div', { class: 'tab-content' },
      el('div', { class: 'item-list' }, ...eq.map(itemRow)),
    );
  }

  if (tab === 'walls') {
    const th = data.townHallLevel || 1;
    const wallCount = WALL_COUNTS[th] || 375;
    const maxWallLevel = th >= 16 ? 17 : th >= 12 ? th + 2 : th >= 7 ? th + 3 : th;

    return el('div', { class: 'tab-content' },
      el('div', { class: 'builders-note' },
        el('strong', {}, '⚠️ Wall data not available'),
        document.createTextNode(' — The official API does not expose individual wall levels. Wall counts and max levels shown below are estimates based on your Town Hall level.'),
      ),
      el('div', { class: 'walls-info' },
        el('div', { class: 'walls-th' }, `Town Hall ${th} Walls`),
        el('div', { class: 'walls-max' }, `~${wallCount} segments`),
        el('div', { class: 'walls-th', style: 'margin-top:8px' }, `Max wall level: ${maxWallLevel}`),
      ),
    );
  }

  if (tab === 'builders') {
    const heroes = cat.heroes;
    const notMaxedHeroes = heroes.filter(h => h.level < h.maxLevel);

    return el('div', { class: 'tab-content' },
      el('div', { class: 'builders-note' },
        el('strong', {}, '⚠️ Live builder queue not available'),
        document.createTextNode(' — The official API does not expose active upgrade queues. Hero upgrade status is shown below based on current vs max levels.'),
      ),
      el('div', { class: 'section-header' }, 'Heroes (use builders)'),
      el('div', { class: 'hero-upgrade-grid' },
        ...heroes.map(h => {
          const isMaxed = h.level >= h.maxLevel;
          return el('div', { class: 'hero-upgrade-card' },
            el('span', { class: 'hero-upgrade-name' }, h.name),
            el('span', { class: 'hero-upgrade-lvl' },
              el('span', { class: 'cur' }, String(h.level)),
              document.createTextNode(` / ${h.maxLevel}`),
            ),
            isMaxed
              ? el('span', { class: 'badge-maxed' }, 'MAX')
              : el('span', { class: 'badge-dark' }, `${h.maxLevel - h.level} left`),
          );
        }),
      ),
      !heroes.length ? el('p', { class: 'empty-tab' }, 'No heroes unlocked') : null,
    );
  }

  if (tab === 'lab') {
    const allTroops = [...cat.regular, ...cat.dark, ...cat.spells, ...cat.sieges];
    const notMaxed = allTroops.filter(t => t.level < t.maxLevel);
    const maxedCount = allTroops.length - notMaxed.length;

    return el('div', { class: 'tab-content' },
      el('div', { class: 'builders-note' },
        el('strong', {}, '⚠️ Live lab queue not available'),
        document.createTextNode(' — The official API does not expose the active lab upgrade. Items below need levels to reach max.'),
      ),
      el('div', { class: 'section-header' }, `Lab Progress — ${maxedCount}/${allTroops.length} maxed`),
      notMaxed.length
        ? el('div', { class: 'item-list' }, ...notMaxed.sort((a, b) => {
            const pa = a.level / a.maxLevel;
            const pb = b.level / b.maxLevel;
            return pb - pa; // closest to max first
          }).map(itemRow))
        : el('p', { class: 'empty-tab' }, '🎉 All troops and spells are maxed!'),
    );
  }

  if (tab === 'stats') {
    const stats = [
      { label: 'Exp Level', val: data.expLevel },
      { label: 'Trophies', val: (data.trophies || 0).toLocaleString() },
      { label: 'Best Trophies', val: (data.bestTrophies || 0).toLocaleString() },
      { label: 'War Stars', val: (data.warStars || 0).toLocaleString() },
      { label: 'Attack Wins', val: (data.attackWins || 0).toLocaleString() },
      { label: 'Defense Wins', val: (data.defenseWins || 0).toLocaleString() },
      { label: 'Donations', val: (data.donations || 0).toLocaleString() },
      { label: 'Donations Rcvd', val: (data.donationsReceived || 0).toLocaleString() },
      { label: 'Builder Hall', val: data.builderHallLevel ? `BH${data.builderHallLevel}` : 'N/A' },
      { label: 'Builder Trophies', val: (data.builderBaseTrophies || 0).toLocaleString() },
      { label: 'Capital Gold', val: (data.clanCapitalContributions || 0).toLocaleString() },
      { label: 'Clan', val: data.clan ? data.clan.name : 'None' },
    ];

    return el('div', { class: 'tab-content' },
      el('div', { class: 'stats-grid' },
        ...stats.map(s => el('div', { class: 'stat-card' },
          el('div', { class: 'stat-card-val' }, String(s.val ?? '—')),
          el('div', { class: 'stat-card-label' }, s.label),
        )),
      ),
    );
  }

  return el('div', { class: 'tab-content' }, el('p', { class: 'empty-tab' }, 'Coming soon'));
}

function renderDetail() {
  const tag = state.detailTag;
  const p = state.players[tag] || {};
  const data = p.data;

  const header = el('header', { class: 'app-header' },
    el('button', {
      class: 'btn btn-icon',
      onclick() { state.view = 'overview'; render(); },
    }, '←'),
    el('h1', {}, data ? data.name : tag),
    el('div', { class: 'header-actions' },
      el('button', {
        class: `btn btn-icon${p.loading ? ' spin' : ''}`,
        onclick() { refreshOne(tag); },
      }, '↻'),
    ),
  );

  if (p.loading && !data) {
    return el('div', { class: 'detail-view' },
      header,
      el('div', { class: 'loading-screen' },
        el('div', { class: 'loader' }),
        'Fetching player data…',
      ),
    );
  }

  if (!data) {
    return el('div', { class: 'detail-view' },
      header,
      el('div', { class: 'loading-screen' }, p.error || 'No data'),
    );
  }

  const cat = categorize(data);
  const pctAll = overallCompletion(data);
  const pills = [
    { label: 'Overall', val: `${pctAll}%` },
    { label: 'Heroes', val: `${completion(cat.heroes)}%` },
    { label: 'Troops', val: `${completion([...cat.regular, ...cat.dark])}%` },
    { label: 'Spells', val: `${completion(cat.spells)}%` },
    { label: 'Sieges', val: `${completion(cat.sieges)}%` },
    { label: 'Equipment', val: `${completion(cat.equipment)}%` },
  ];

  const tabBar = el('div', { class: 'tab-bar' },
    ...TABS.map(t => el('button', {
      class: `tab-btn${state.detailTab === t.id ? ' active' : ''}`,
      onclick() {
        state.detailTab = t.id;
        render();
      },
    }, t.label)),
  );

  return el('div', { class: 'detail-view' },
    header,
    el('div', { class: 'detail-hero' },
      el('div', { class: 'detail-hero-top' },
        el('div', {},
          el('div', { class: 'detail-name' }, data.name),
          el('div', { class: 'detail-meta' },
            el('span', { class: 'meta-chip' }, `TH ${el('strong', {}, String(data.townHallLevel))}`),
            data.builderHallLevel
              ? el('span', { class: 'meta-chip' }, `BH ${el('strong', {}, String(data.builderHallLevel))}`)
              : null,
            el('span', { class: 'meta-chip' }, `Lvl ${el('strong', {}, String(data.expLevel))}`),
            data.clan ? el('span', { class: 'meta-chip' }, data.clan.name) : null,
          ),
        ),
      ),
      el('div', { class: 'detail-completion' },
        ...pills.map(pill =>
          el('div', { class: 'comp-pill' },
            el('div', { class: 'comp-pill-val' }, pill.val),
            el('div', { class: 'comp-pill-label' }, pill.label),
          )
        ),
      ),
    ),
    tabBar,
    renderDetailTab(data),
  );
}

// ── Main render ───────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  if (!state.apiKey) {
    app.appendChild(renderSetup());
    return;
  }

  if (state.view === 'detail' && state.detailTag) {
    app.appendChild(renderDetail());
    return;
  }

  // Overview
  const header = el('header', { class: 'app-header' },
    el('h1', {}, '⚔️ COC Tracker'),
    el('div', { class: 'header-actions' },
      el('button', {
        class: `btn btn-icon${state.globalLoading ? ' spin' : ''}`,
        onclick: refreshAll,
      }, '↻'),
    ),
  );

  app.appendChild(header);
  const grid = el('div', { class: 'overview-grid' });
  grid.appendChild(renderOverview());
  app.appendChild(grid);
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  const saved = window.COC_DEFAULT_KEY || localStorage.getItem('coc_api_key') || '';
  if (saved) {
    state.apiKey = saved;
    localStorage.setItem('coc_api_key', saved);
    refreshAll();
  }
  render();
}

init();
