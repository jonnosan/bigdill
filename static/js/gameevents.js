/**
 * gameevents.js — Game Events screen.
 * Manages video player, seekbar, scoreboard, event list, and BGDL text editor.
 */
const GameEvents = (() => {

  let game = null;
  let events = [];
  let player = null;
  let saveTimer = null;
  let currentWallSecs = 0;

  // ── Init / Destroy ────────────────────────────────────────────────────────

  function init(g) {
    game = g;
    events = parseEvents(g.bgdl_events || '');
    populateScoreboard();
    initVideo();
    initSeekbar();
    initControls();
    initEventPanel();
    bindHeaderButtons();
    bindKeyboard();
  }

  function destroy() {
    if (player) { try { player.dispose(); } catch(e){} player = null; }
    document.removeEventListener('keydown', onKeyDown);
    clearTimeout(saveTimer);
  }

  // ── BGDL events ───────────────────────────────────────────────────────────

  function parseEvents(text) {
    if (!text) return [];
    const parsed = BGDL.parse(text);
    return parsed.events;
  }

  function eventsToText() {
    return events.map(e => e.raw).join('\n');
  }

  // ── Scoreboard ────────────────────────────────────────────────────────────

  function populateScoreboard() {
    document.getElementById('sb-team-a').textContent = teamName('a');
    document.getElementById('sb-team-b').textContent = teamName('b');
    updateScoreboard(0);
  }

  function teamName(side) {
    const raw = side === 'a' ? (game.team_a || 'Team A') : (game.team_b || 'Team B');
    return raw.split(',')[0].trim() || (side === 'a' ? 'Team A' : 'Team B');
  }

  function updateScoreboard(wallSecs) {
    const state = Score.calculate(events, wallSecs, game.periods);
    const { numPeriods } = Score.parsePeriods(game.periods);
    document.getElementById('sb-score-a').textContent = state.scoreA;
    document.getElementById('sb-score-b').textContent = state.scoreB;
    document.getElementById('sb-clock').textContent = Score.formatClock(state.period, state.gameClockSecs, numPeriods);
    document.getElementById('btn-clock-period').disabled = state.clockRunning;
    document.getElementById('btn-clock-continue').disabled = state.clockRunning || !(state.gameClockSecs > 0);
    document.getElementById('btn-clock-stop').disabled = !state.clockRunning;
  }

  // ── Video Player ──────────────────────────────────────────────────────────

  function ensureVideoElement() {
    // dispose() removes the element from the DOM; recreate it if missing
    let el = document.getElementById('game-video');
    if (!el) {
      el = document.createElement('video');
      el.id = 'game-video';
      el.className = 'video-js vjs-default-skin';
      el.setAttribute('preload', 'auto');
      document.getElementById('video-wrapper').appendChild(el);
    }
    return el;
  }

  function initVideo() {
    const url = game.video_url || '';
    const isYT = /youtube\.com|youtu\.be/i.test(url);

    // Dispose any previous player (removes the DOM element)
    if (window.videojs) {
      const existing = videojs.getPlayer('game-video');
      if (existing) { try { existing.dispose(); } catch(e){} }
    }

    ensureVideoElement();

    // Only use youtube tech if the plugin has actually loaded
    const ytReady = isYT && window.videojs && typeof videojs.getTech === 'function' && videojs.getTech('Youtube');

    const opts = {
      controls: false,
      preload: 'auto',
      techOrder: ytReady ? ['youtube', 'html5'] : ['html5'],
    };
    if (ytReady) opts.sources = [{ src: url, type: 'video/youtube' }];

    try {
      player = videojs('game-video', opts);
      if (!ytReady && url) player.src(url);
    } catch (e) {
      console.error('Video.js init error:', e);
      return;
    }

    if (!isYT && url) {
      player.src(url);
    }

    player.on('timeupdate', () => {
      const t = player.currentTime() || 0;
      currentWallSecs = t;
      updateScoreboard(t);
      drawSeekbar();
      updateTimeDisplay();
      highlightCurrentRow();
    });

    player.on('play', () => {
      document.getElementById('vc-play').textContent = '⏸';
    });
    player.on('pause', () => {
      document.getElementById('vc-play').textContent = '▶';
    });
  }

  // ── Seekbar ───────────────────────────────────────────────────────────────

  const CATEGORY_COLORS_CANVAS = {
    clock: '#4f8ef7', shot: '#2ecc71', foul: '#e74c3c',
    violation: '#e67e22', lineup: '#9b59b6', rebound: '#1abc9c',
    turnover: '#f1c40f', score: '#bdc3c7',
  };

  let seekDragging = false;

  function initSeekbar() {
    const canvas = document.getElementById('seekbar-canvas');

    // Mouse
    canvas.addEventListener('mousedown', (e) => {
      seekDragging = true;
      seekbarSeekTo(e.clientX);
    });
    canvas.addEventListener('mousemove', onSeekbarHover);
    document.addEventListener('mousemove', (e) => {
      if (seekDragging) seekbarSeekTo(e.clientX);
    });
    document.addEventListener('mouseup', () => { seekDragging = false; });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      seekDragging = true;
      seekbarSeekTo(e.touches[0].clientX);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (seekDragging) seekbarSeekTo(e.touches[0].clientX);
    }, { passive: false });
    canvas.addEventListener('touchend', () => { seekDragging = false; });

    drawSeekbar();
  }

  function seekbarSeekTo(clientX) {
    if (!player || !player.duration()) return;
    const canvas = document.getElementById('seekbar-canvas');
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    player.currentTime(ratio * player.duration());
  }

  function drawSeekbar() {
    const canvas = document.getElementById('seekbar-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || canvas.width;
    const H = canvas.offsetHeight || canvas.height;
    canvas.width = W;
    canvas.height = H;

    const duration = player ? (player.duration() || 0) : 0;

    // Track background
    ctx.fillStyle = '#23263a';
    ctx.fillRect(0, 0, W, H);

    // Progress
    if (duration > 0) {
      const px = (currentWallSecs / duration) * W;
      ctx.fillStyle = '#2d5cbf';
      ctx.fillRect(0, 0, px, H);

      // Playhead
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - 1, 0, 2, H);
    }

    // Event markers
    for (const ev of events) {
      if (ev.wallSecs == null || duration <= 0) continue;
      const x = Math.round((ev.wallSecs / duration) * W);
      const cat = BGDL.eventCategory(ev.type);
      ctx.fillStyle = CATEGORY_COLORS_CANVAS[cat] || '#bdc3c7';
      ctx.fillRect(x - 1, 2, 3, H - 4);
    }
  }

  function onSeekbarHover(e) {
    if (!player || !player.duration()) return;
    const rect = e.target.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const hoverSecs = ratio * player.duration();
    // Find nearest event within 5px
    const threshold = (10 / rect.width) * player.duration();
    const nearest = events.reduce((best, ev) => {
      if (ev.wallSecs == null) return best;
      const d = Math.abs(ev.wallSecs - hoverSecs);
      return (!best || d < best.d) ? { ev, d } : best;
    }, null);
    const canvas = document.getElementById('seekbar-canvas');
    if (nearest && nearest.d <= threshold) {
      canvas.title = BGDL.describe(nearest.ev, [teamName('a'), teamName('b')]);
    } else {
      canvas.title = BGDL.secsToWallClock(hoverSecs);
    }
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  function initControls() {
    document.getElementById('vc-play').onclick = () => player && (player.paused() ? player.play() : player.pause());
    document.getElementById('vc-back5').onclick = () => player && player.currentTime(Math.max(0, player.currentTime() - 5));
    document.getElementById('vc-fwd5').onclick = () => player && player.currentTime(player.currentTime() + 5);
    document.getElementById('vc-back30').onclick = () => player && player.currentTime(Math.max(0, player.currentTime() - 30));
    document.getElementById('vc-fwd30').onclick = () => player && player.currentTime(player.currentTime() + 30);
    document.getElementById('vc-speed').onchange = (e) => player && player.playbackRate(parseFloat(e.target.value));
    document.getElementById('vc-mute').onclick = () => {
      if (!player) return;
      const muted = !player.muted();
      player.muted(muted);
      document.getElementById('vc-mute').textContent = muted ? '🔇' : '🔊';
    };
  }

  function updateTimeDisplay() {
    if (!player) return;
    const cur = BGDL.secsToWallClock(player.currentTime());
    const dur = BGDL.secsToWallClock(player.duration());
    document.getElementById('vc-time').textContent = `${cur} / ${dur}`;
  }

  // ── Event Panel ───────────────────────────────────────────────────────────

  function initEventPanel() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.getElementById('tab-list').hidden = tab !== 'list';
        document.getElementById('tab-bgdl').hidden = tab !== 'bgdl';
        if (tab === 'bgdl') syncBgdlEditor();
      });
    });

    document.getElementById('btn-bgdl-apply').onclick = applyBgdlEditor;
    document.getElementById('btn-add-event').onclick = () => {
      openEventEntry(currentWallSecs, null, onEventCommitted);
    };

    // Wire row click handler once here, not in renderEventTable
    document.getElementById('events-tbody').addEventListener('click', handleEventRowAction);

    renderEventTable();
  }

  function renderEventTable() {
    const tbody = document.getElementById('events-tbody');
    tbody.innerHTML = '';
    if (!events.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim);text-align:center;padding:20px">No events recorded yet.</td></tr>';
      return;
    }
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const tr = document.createElement('tr');
      tr.dataset.idx = i;
      const cat = BGDL.eventCategory(ev.type);
      const badge = `<span class="type-badge ${BGDL.badgeClass(ev.type)}">${esc(ev.type)}</span>`;
      const gcStr = ev.gameClock ? ev.gameClock.raw : '—';
      tr.innerHTML = `
        <td>${esc(ev.wallClock)}</td>
        <td>${esc(gcStr)}</td>
        <td>${badge}</td>
        <td>${esc(BGDL.describe(ev, [teamName('a'), teamName('b')]))}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm btn-secondary" data-action="edit" data-idx="${i}">Edit</button>
            <button class="btn btn-sm btn-secondary" data-action="delete" data-idx="${i}">✕</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }

    drawSeekbar();
  }

  function handleEventRowAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) {
      const tr = e.target.closest('tr[data-idx]');
      if (tr && player) {
        const ev = events[parseInt(tr.dataset.idx, 10)];
        if (ev && ev.wallSecs != null) player.currentTime(ev.wallSecs);
      }
      return;
    }
    const idx = parseInt(btn.dataset.idx, 10);
    if (btn.dataset.action === 'delete') {
      if (!confirm('Delete this event?')) return;
      lastDeleted = { ev: events[idx], idx };
      events.splice(idx, 1);
      onEventsChanged();
      showUndoToast();
    }
    if (btn.dataset.action === 'edit') {
      openEventEntry(null, events[idx], (raw) => {
        const parsed = BGDL.parseEvent(raw);
        if (parsed) { events[idx] = parsed; onEventsChanged(); }
      });
    }
  }

  function highlightCurrentRow() {
    const tbody = document.getElementById('events-tbody');
    const rows = tbody.querySelectorAll('tr[data-idx]');
    let lastBefore = -1;
    for (let i = 0; i < events.length; i++) {
      if (events[i].wallSecs != null && events[i].wallSecs <= currentWallSecs) lastBefore = i;
    }
    rows.forEach(tr => {
      tr.classList.toggle('current-row', parseInt(tr.dataset.idx) === lastBefore);
    });
    const currentRow = tbody.querySelector('tr.current-row');
    if (currentRow) currentRow.scrollIntoView({ block: 'nearest' });
  }

  function syncBgdlEditor() {
    document.getElementById('bgdl-text-editor').value = eventsToText();
    document.getElementById('bgdl-parse-status').textContent = '';
  }

  function applyBgdlEditor() {
    const text = document.getElementById('bgdl-text-editor').value;
    try {
      const parsed = BGDL.parse(text);
      events = parsed.events;
      document.getElementById('bgdl-parse-status').textContent = `OK — ${events.length} events`;
      document.getElementById('bgdl-parse-status').className = 'ok';
      onEventsChanged();
    } catch (e) {
      document.getElementById('bgdl-parse-status').textContent = 'Parse error: ' + e.message;
      document.getElementById('bgdl-parse-status').className = 'err';
    }
  }

  // ── Clock buttons ─────────────────────────────────────────────────────────

  function bindHeaderButtons() {
    document.getElementById('btn-clock-period').onclick = () => recordStartOfPeriod();
    document.getElementById('btn-clock-continue').onclick = () => recordClockEvent('start');
    document.getElementById('btn-clock-stop').onclick = () => recordClockEvent('stop');
    document.getElementById('btn-ge-setup').onclick = () => AppState.navigate('setup', game);
    document.getElementById('btn-ge-export').onclick = () => {
      API.exportGame(game.id, (game.game_name || 'game') + '.bgdl');
    };
    document.getElementById('btn-ge-save').onclick = () => saveNow();
  }

  function recordClockEvent(type) {
    const wc = BGDL.secsToWallClock(currentWallSecs);
    const raw = `${wc} ${type}`;
    const ev = BGDL.parseEvent(raw);
    if (ev) {
      insertEventSorted(ev);
      onEventsChanged();
    }
  }

  async function recordStartOfPeriod() {
    // Prompt for lineups if a team has a roster but no lineup event recorded yet
    for (const team of ['a', 'b']) {
      if (hasRoster(team) && !hasLineup(team)) {
        const jerseys = await promptLineup(team);
        if (jerseys) recordLineupEvent(team, jerseys);
      }
    }

    // Determine next period number from existing events
    let maxPeriod = 0;
    for (const ev of events) {
      if (ev.gameClock && ev.gameClock.period > maxPeriod) {
        maxPeriod = ev.gameClock.period;
      }
    }
    const nextPeriod = maxPeriod + 1;

    // Determine duration for this period
    const { numPeriods, periodDuration, overtimeDuration } = Score.parsePeriods(game.periods);
    const durationSecs = nextPeriod <= numPeriods ? periodDuration : overtimeDuration;

    // Format as mm:ss
    const m = Math.floor(durationSecs / 60);
    const s = durationSecs % 60;
    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const wc = BGDL.secsToWallClock(currentWallSecs);
    const raw = `${wc} P${nextPeriod}T${timeStr} start`;
    const ev = BGDL.parseEvent(raw);
    if (ev) {
      insertEventSorted(ev);
      onEventsChanged();
    }
  }

  function hasRoster(team) {
    const r = team === 'a' ? game.roster_a : game.roster_b;
    return Array.isArray(r) && r.length > 0;
  }

  function hasLineup(team) {
    const type = team === 'a' ? 'la' : 'lb';
    return events.some(ev => ev.type && ev.type.toLowerCase() === type);
  }

  function promptLineup(team) {
    return new Promise(resolve => {
      const roster = team === 'a' ? (game.roster_a || []) : (game.roster_b || []);
      document.getElementById('lineup-modal-title').textContent = `Starting Lineup — ${teamName(team)}`;

      const countEl = document.getElementById('lineup-count');
      const listEl = document.getElementById('lineup-list');
      listEl.innerHTML = '';
      const selected = new Set();

      function updateCount() {
        countEl.textContent = `${selected.size} of 5 selected`;
      }
      updateCount();

      for (const p of roster) {
        const label = document.createElement('label');
        label.className = 'lineup-player';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = p.jersey;
        cb.addEventListener('change', () => {
          if (cb.checked) selected.add(p.jersey);
          else selected.delete(p.jersey);
          updateCount();
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(` #${p.jersey}${p.name ? '  ' + p.name : ''}`));
        listEl.appendChild(label);
      }

      const modal = document.getElementById('lineup-modal');
      if (player) player.pause();
      modal.hidden = false;

      function closeLineup(result) {
        modal.hidden = true;
        resolve(result);
      }
      document.getElementById('lineup-confirm').onclick = () => closeLineup(selected.size > 0 ? [...selected] : null);
      document.getElementById('lineup-skip').onclick = () => closeLineup(null);
    });
  }

  function recordLineupEvent(team, jerseys) {
    const type = team === 'a' ? 'la' : 'lb';
    const wc = BGDL.secsToWallClock(currentWallSecs);
    const raw = `${wc} ${type} ${jerseys.join(',')}`;
    const ev = BGDL.parseEvent(raw);
    if (ev) insertEventSorted(ev);
  }

  // ── Event entry wrapper (pause + resume) ──────────────────────────────────

  function openEventEntry(wallSecs, existingEvent, cb) {
    if (player) player.pause();
    const modal = document.getElementById('entry-modal');
    const observer = new MutationObserver(() => {
      if (modal.hidden) {
        observer.disconnect();
        if (player) player.play();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
    EventEntry.open(wallSecs, existingEvent, cb);
  }

  // ── Event commit ──────────────────────────────────────────────────────────

  function onEventCommitted(raw) {
    const ev = BGDL.parseEvent(raw);
    if (!ev) return;

    // Auto-stop for non-running-clock games
    if (!game.running_clock) {
      const type = ev.type.toLowerCase();
      const foulTypes = ['df','of','tf','uf','dq'];
      const violationTypes = ['travel','out','back','double','shotclock','3s','5s','8s'];
      if (foulTypes.includes(type) || violationTypes.includes(type)) {
        // Check if clock is already stopped at this position
        const state = Score.calculate(events, ev.wallSecs, game.periods);
        if (state.clockRunning) {
          const stopRaw = `${ev.wallClock} stop`;
          const stopEv = BGDL.parseEvent(stopRaw);
          if (stopEv) insertEventSorted(stopEv);
        }
      }
    }

    insertEventSorted(ev);
    onEventsChanged();
    const warnings = validateEvent(ev);
    if (warnings.length) showWarnings(warnings);
  }

  // Zone map: 3 = 3pt, 2 = 2pt
  const SHOT_ZONES = { LC:3, LW:3, TC:3, RW:3, RC:3, LE:2, TM:2, TP:2, RM:2, RE:2, LP:2, RIM:2, RP:2 };
  const TWO_PT_TYPES = ['2pt', 'dunk', 'pb'];

  function validateEvent(ev) {
    const warnings = [];
    const type = (ev.type || '').toLowerCase();

    // Shot zone mismatch
    if (ev.location && SHOT_ZONES[ev.location.toUpperCase()]) {
      const zone = SHOT_ZONES[ev.location.toUpperCase()];
      if (type === '3pt' && zone === 2)
        warnings.push(`3pt shot recorded in a 2pt zone (${ev.location})`);
      if (TWO_PT_TYPES.includes(type) && zone === 3)
        warnings.push(`2pt shot recorded in a 3pt zone (${ev.location})`);
    }

    // Lineup size
    if ((type === 'la' || type === 'lb') && Array.isArray(ev.players)) {
      if (ev.players.length < 5)
        warnings.push(`Lineup has only ${ev.players.length} player${ev.players.length !== 1 ? 's' : ''} (expected 5)`);
      else if (ev.players.length > 5)
        warnings.push(`Lineup has ${ev.players.length} players (expected 5)`);
    }

    return warnings;
  }

  let _toastTimer = null;
  function showWarnings(warnings) {
    const toast = document.getElementById('warning-toast');
    toast.textContent = warnings.join('\n');
    toast.hidden = false;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  }

  function insertEventSorted(ev) {
    // Insert at correct position by wallSecs
    const ws = ev.wallSecs != null ? ev.wallSecs : Infinity;
    let idx = events.findIndex(e => (e.wallSecs != null ? e.wallSecs : Infinity) > ws);
    if (idx === -1) idx = events.length;
    events.splice(idx, 0, ev);
  }

  // ── Undo delete ───────────────────────────────────────────────────────────

  let lastDeleted = null;
  let _undoTimer = null;

  function showUndoToast() {
    const toast = document.getElementById('undo-toast');
    toast.hidden = false;
    document.getElementById('undo-btn').onclick = undoDelete;
    clearTimeout(_undoTimer);
    _undoTimer = setTimeout(() => { toast.hidden = true; lastDeleted = null; }, 10000);
  }

  function undoDelete() {
    if (!lastDeleted) return;
    const ev = lastDeleted.ev;
    lastDeleted = null;
    clearTimeout(_undoTimer);
    document.getElementById('undo-toast').hidden = true;
    insertEventSorted(ev);
    onEventsChanged();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  function onEventsChanged() {
    renderEventTable();
    updateScoreboard(currentWallSecs);
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 2000);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    if (!game || !game.id) return;
    try {
      await API.updateGame(game.id, { bgdl_events: eventsToText() });
      flashSaved();
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }

  let _savedTimer = null;
  function flashSaved() {
    const btn = document.getElementById('btn-ge-save');
    const orig = btn.textContent;
    btn.textContent = 'Saved ✓';
    btn.disabled = true;
    clearTimeout(_savedTimer);
    _savedTimer = setTimeout(() => {
      btn.textContent = orig;
      btn.disabled = false;
    }, 1500);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  function bindKeyboard() {
    document.addEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    // Don't fire when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (!document.getElementById('gameevents-screen').classList.contains('active')) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (player && !player.paused()) {
        openEventEntry(currentWallSecs, null, onEventCommitted);
      } else {
        player && player.play();
      }
    }
    if (e.code === 'ArrowLeft' && !e.shiftKey) { e.preventDefault(); player && player.currentTime(Math.max(0, player.currentTime() - 5)); }
    if (e.code === 'ArrowRight' && !e.shiftKey) { e.preventDefault(); player && player.currentTime(player.currentTime() + 5); }
    if (e.code === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); player && player.currentTime(Math.max(0, player.currentTime() - 30)); }
    if (e.code === 'ArrowRight' && e.shiftKey) { e.preventDefault(); player && player.currentTime(player.currentTime() + 30); }
    if (e.code === 'KeyN') { e.preventDefault(); openEventEntry(currentWallSecs, null, onEventCommitted); }
    if (e.code === 'Escape') { EventEntry.close(); }
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undoDelete(); }
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { init, destroy };
})();
