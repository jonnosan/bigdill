// ── Game Events Screen Logic ──────────────────────────────────────────────────

const GameEvents = (() => {
  'use strict';

  const WINDOW_HALF = 7;   // rows before/after current
  const TOTAL_ROWS  = WINDOW_HALF * 2 + 1;

  let player = null;      // VideoJS instance
  let clockTimer = null;  // rAF handle for game clock updates
  let mode = 'playback';  // 'playback' | 'record'
  let currentIdx = -1;    // index in AppState.events of "current" row (-1 = virtual)
  let editingRow = null;  // { wallClock, gameClock, eventType, eventData, isNew }
  let dirty = false;      // unsaved changes since last save / screen load

  function handleBeforeUnload(e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  }

  const $ = id => document.getElementById(id);

  // ── Initialise ──────────────────────────────────────────────────────────────
  function init() {
    dirty = false;
    window.addEventListener('beforeunload', handleBeforeUnload);
    populateInfoBar();
    buildEmptyTable();
    initVideo();
    bindControls();
    setMode('playback');
    updateEventCount();
  }

  // ── Destroy (when leaving screen) ───────────────────────────────────────────
  function destroy() {
    if (player) { player.pause(); }
    stopClockTimer();
    document.removeEventListener('keydown', handleKey);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  }

  // ── Info bar ────────────────────────────────────────────────────────────────
  function populateInfoBar() {
    const h = window.AppState.header;
    $('gd-game-name').textContent = h.game || '(Unnamed Game)';
    $('gd-game-date').textContent = h.date || '';
    const a = $('gd-team-a');
    const b = $('gd-team-b');
    a.textContent = h.teamA.name || 'Team A';
    b.textContent = h.teamB.name || 'Team B';
    a.style.borderColor = h.teamA.color || '#555';
    b.style.borderColor = h.teamB.color || '#555';
    if (h.teamA.color) a.style.color = h.teamA.color;
    if (h.teamB.color) b.style.color = h.teamB.color;

    $('score-team-a').textContent = h.teamA.name || 'Team A';
    $('score-team-b').textContent = h.teamB.name || 'Team B';
  }

  // ── Video init ──────────────────────────────────────────────────────────────
  function initVideo() {
    const h = window.AppState.header;
    const url = h.video || '';

    if (player) {
      player.dispose();
      player = null;
      // Recreate the video element (videojs removes it on dispose)
      const wrapper = $('video-wrapper');
      const vid = document.createElement('video');
      vid.id = 'main-video';
      vid.className = 'video-js vjs-default-skin';
      vid.setAttribute('preload', 'auto');
      vid.setAttribute('playsinline', '');
      wrapper.appendChild(vid);
    }

    const vjsOptions = resolveVideoOptions(url);
    player = videojs('main-video', vjsOptions);

    player.on('timeupdate', onTimeUpdate);
    player.on('play',     () => { updatePlayPause(); startClockTimer(); });
    player.on('pause',    () => { updatePlayPause(); stopClockTimer(); updateGameClock(); });
    player.on('ended',    () => { updatePlayPause(); stopClockTimer(); });
    player.on('loadedmetadata', updateSeekbarRange);
  }

  function resolveVideoOptions(url) {
    const shared = { controls: false, userActions: { hotkeys: false } };

    if (!url) return { ...shared, fluid: false };

    // YouTube
    if (/youtube\.com|youtu\.be/i.test(url)) {
      return {
        ...shared, fluid: false,
        techOrder: ['youtube'],
        sources: [{ type: 'video/youtube', src: url }],
        youtube: { iv_load_policy: 3, modestbranding: 1 }
      };
    }
    // HLS
    if (/\.m3u8/i.test(url)) {
      return { ...shared, sources: [{ type: 'application/x-mpegURL', src: url }] };
    }
    // DASH
    if (/\.mpd/i.test(url)) {
      return { ...shared, sources: [{ type: 'application/dash+xml', src: url }] };
    }
    // MP4 / MOV
    const ext = url.split('.').pop().toLowerCase();
    const mimeMap = { mp4: 'video/mp4', mov: 'video/mp4', webm: 'video/webm' };
    return {
      ...shared,
      sources: [{ type: mimeMap[ext] || 'video/mp4', src: url }]
    };
  }

  // ── Record validation ────────────────────────────────────────────────────────
  // Returns true if it is safe to leave the current editing row (no content, or content
  // that parses OK). Returns false if the user has typed something that is invalid and
  // chose to stay and keep editing.
  function canLeaveCurrentRecord() {
    if (!editingRow) return true;
    const evInput = document.getElementById('edit-eventdata');
    const evVal = evInput ? evInput.value.trim() : '';
    if (!evVal) return true; // nothing typed — safe to discard silently

    const ttInput = document.getElementById('edit-timetag');
    const ttVal = ttInput ? ttInput.value.trim() : (editingRow.wallClock || '');
    if (BGDL.parseDetailLine(ttVal + ' ' + evVal)) return true; // valid — safe to leave

    return confirm('This record is not valid and cannot be saved.\nDiscard it and continue?');
  }

  // ── Video controls ──────────────────────────────────────────────────────────
  function bindControls() {
    $('btn-gd-save').addEventListener('click', saveFile);

    $('mode-indicator').addEventListener('click', () => {
      if (mode === 'record') {
        if (canLeaveCurrentRecord()) setMode('playback');
      } else {
        setMode('record');
      }
    });

    // Click an event row in playback mode → seek to that wall clock
    $('events-tbody').addEventListener('click', (e) => {
      if (mode !== 'playback') return;
      const tr = e.target.closest('tr');
      if (!tr || !tr.dataset.wallClock) return;
      const secs = BGDL.parseWallClock(tr.dataset.wallClock);
      if (player) player.currentTime(secs);
      updateGameClock();
      renderTable();
    });
    $('btn-playpause').addEventListener('click', togglePlayPause);
    $('btn-back5').addEventListener('click',  () => seekBy(-5));
    $('btn-back30').addEventListener('click', () => seekBy(-30));
    $('btn-fwd5').addEventListener('click',   () => seekBy(5));
    $('btn-fwd30').addEventListener('click',  () => seekBy(30));

    // Seek bar
    const seekbar = $('seekbar');
    seekbar.addEventListener('input', () => {
      if (!player) return;
      const dur = player.duration() || 0;
      if (!dur) return;
      player.currentTime((seekbar.value / 1000) * dur);
    });
    // Prevent spacebar on seekbar from toggling record mode
    seekbar.addEventListener('keydown', e => e.stopPropagation());

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        if (player) player.playbackRate(speed);
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.addEventListener('keydown', handleKey);
  }

  function togglePlayPause() {
    if (!player) return;
    if (player.paused()) { player.play(); }
    else                 { player.pause(); }
  }

  function seekBy(delta) {
    if (!player) return;
    const t = (player.currentTime() || 0) + delta;
    player.currentTime(Math.max(0, t));
    updateGameClock();
    renderTable();
  }

  function updatePlayPause() {
    $('btn-playpause').textContent = (player && !player.paused()) ? '⏸' : '▶';
  }

  // ── Seekbar helpers ─────────────────────────────────────────────────────────
  function updateSeekbarRange() {
    // Called once duration is known
  }

  function updateSeekbar() {
    const seekbar = $('seekbar');
    if (!player || !seekbar) return;
    const dur = player.duration() || 0;
    if (!dur) return;
    const pct = (player.currentTime() / dur) * 1000;
    // Only update if user isn't dragging
    if (document.activeElement !== seekbar) {
      seekbar.value = pct;
    }
  }

  // ── Time display update ─────────────────────────────────────────────────────
  function onTimeUpdate() {
    if (!player) return;
    const cur = player.currentTime() || 0;
    const dur = player.duration()    || 0;
    $('td-elapsed').textContent   = fmtTime(cur);
    $('td-remaining').textContent = dur ? fmtTime(dur - cur) : '—';
    updateSeekbar();
    renderTable();
  }

  function fmtTime(s) {
    s = Math.max(0, s);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // ── Game clock ──────────────────────────────────────────────────────────────
  function startClockTimer() {
    if (clockTimer) return;
    function tick() {
      updateGameClock();
      clockTimer = requestAnimationFrame(tick);
    }
    clockTimer = requestAnimationFrame(tick);
  }

  function stopClockTimer() {
    if (clockTimer) { cancelAnimationFrame(clockTimer); clockTimer = null; }
  }

  function updateGameClock() {
    if (!player) return;
    const wallSecs = player.currentTime() || 0;

    const gc = BGDL.computeGameClock(window.AppState.events, wallSecs, window.AppState.header);
    const { period, secsRemaining } = gc;
    const mm = Math.floor(secsRemaining / 60);
    const ss = Math.floor(secsRemaining % 60);
    $('game-clock-display').textContent =
      `P${period} · ${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    const { scoreA, scoreB } = BGDL.computeScore(window.AppState.events, wallSecs);
    $('score-value').textContent = `${scoreA} : ${scoreB}`;
  }

  // ── Mode ────────────────────────────────────────────────────────────────────
  function setMode(m) {
    const prevMode = mode;
    mode = m;
    const ind = $('mode-indicator');
    if (m === 'playback') {
      ind.textContent = 'Playback';
      ind.className = 'playback';
      leaveRecordMode(prevMode === 'record');
    } else {
      ind.textContent = 'Record Entry';
      ind.className = 'record';
      enterRecordMode();
    }
  }

  function enterRecordMode() {
    if (player) player.pause();
    stopClockTimer();

    const wallSecs = player ? (player.currentTime() || 0) : 0;
    const wallStr  = BGDL.formatWallClock(wallSecs, 2);
    const gc       = BGDL.computeGameClock(window.AppState.events, wallSecs, window.AppState.header);
    const gcStr    = BGDL.formatGameClock(gc.period, gc.secsRemaining);

    // Check for existing record within 0.01s
    const existing = findExistingRecord(wallSecs);
    if (existing) {
      editingRow = { ...existing, isNew: false };
      currentIdx = window.AppState.events.indexOf(existing);
    } else {
      editingRow = {
        wallClock: wallStr,
        gameClock: gcStr,
        eventType: '',
        eventData: '',
        raw: '',
        isNew: true
      };
      currentIdx = -1;
    }

    renderTable();
    focusCurrentRow();
  }

  function leaveRecordMode(resumePlay) {
    editingRow = null;
    renderTable();
    if (resumePlay && player) player.play();
  }

  function findExistingRecord(wallSecs) {
    return window.AppState.events.find(ev => {
      const t = BGDL.parseWallClock(ev.wallClock);
      return Math.abs(t - wallSecs) <= 0.01;
    }) || null;
  }

  // ── Table rendering ─────────────────────────────────────────────────────────
  function buildEmptyTable() {
    const tbody = $('events-tbody');
    tbody.innerHTML = '';
    for (let i = 0; i < TOTAL_ROWS; i++) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td></td><td></td>';
      tbody.appendChild(tr);
    }
  }

  function renderTable() {
    if (!player) return;
    const wallSecs = player.currentTime() || 0;
    const events   = window.AppState.events;
    const tbody    = $('events-tbody');
    const rows     = tbody.querySelectorAll('tr');

    // Find index of "current" event (last event with wallClock <= wallSecs)
    let pivotIdx = -1; // virtual position before first event
    for (let i = 0; i < events.length; i++) {
      if (BGDL.parseWallClock(events[i].wallClock) <= wallSecs) pivotIdx = i;
      else break;
    }

    // Build slot list: WINDOW_HALF rows before current, current row, WINDOW_HALF rows after
    const slotList = [];
    for (let i = 0; i < TOTAL_ROWS; i++) {
      const offset = i - WINDOW_HALF; // -7 to +7
      if (offset === 0) {
        slotList.push({ kind: 'current', evIdx: pivotIdx });
      } else if (offset < 0) {
        slotList.push({ kind: 'past', evIdx: pivotIdx + offset + 1 });
      } else {
        slotList.push({ kind: 'future', evIdx: pivotIdx + offset });
      }
    }

    slotList.forEach((slot, rowIndex) => {
      const tr = rows[rowIndex];
      tr.className = slot.kind;

      let timeTagTxt = '', eventDataTxt = '', descTxt = '';

      const isCurrent = slot.kind === 'current';
      const inRecord  = mode === 'record' && isCurrent;

      if (inRecord && editingRow) {
        // Editable current row
        tr.dataset.wallClock = '';
        tr.classList.add('record-mode');
        const ttVal  = editingRow.gameClock
          ? `${editingRow.wallClock} ${editingRow.gameClock}`
          : editingRow.wallClock;
        const evVal  = [editingRow.eventType, editingRow.eventData].filter(Boolean).join(' ');
        const desc   = editingRow.eventType
          ? BGDL.describe(editingRow.eventType, editingRow.eventData,
              window.AppState.header.teamA.name, window.AppState.header.teamB.name)
          : '';

        tr.cells[0].innerHTML = `<input id="edit-timetag"  value="${escHtml(ttVal)}"  />`;
        tr.cells[1].innerHTML = `<input id="edit-eventdata" value="${escHtml(evVal)}" />`;
        tr.cells[2].textContent = desc;
        return;
      }

      // Read-only row
      const ev = window.AppState.events[slot.evIdx];
      tr.dataset.wallClock = ev ? ev.wallClock : '';
      if (ev) {
        const ttDisplay = ev.gameClock ? `${ev.wallClock} ${ev.gameClock}` : ev.wallClock;
        const evDisplay = [ev.eventType, ev.eventData].filter(Boolean).join(' ');
        timeTagTxt  = ttDisplay;
        eventDataTxt = evDisplay;
        descTxt = BGDL.describe(ev.eventType, ev.eventData,
          window.AppState.header.teamA.name, window.AppState.header.teamB.name);
      }
      tr.cells[0].textContent = timeTagTxt;
      tr.cells[1].textContent = eventDataTxt;
      tr.cells[2].textContent = descTxt;
    });
  }

  function focusCurrentRow() {
    // Let the DOM settle then focus the event data input
    setTimeout(() => {
      const ttInput = document.getElementById('edit-timetag');
      const evInput = document.getElementById('edit-eventdata');
      if (evInput) {
        evInput.focus();
        // Live description update
        evInput.addEventListener('input', onEventDataInput);
      }
      if (ttInput) {
        ttInput.addEventListener('keydown', (e) => {
          if (e.key === 'Tab')       { e.preventDefault(); if (evInput) evInput.focus(); }
          if (e.key === 'Enter')     commitRecord();
          if (e.key === 'Escape')    { if (canLeaveCurrentRecord()) setMode('playback'); }
          if (e.key === 'ArrowUp')   { e.preventDefault(); navigateRecord(-1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); navigateRecord(1); }
        });
      }
      if (evInput) {
        evInput.addEventListener('keydown', (e) => {
          if (e.key === 'Tab')       { e.preventDefault(); if (ttInput) ttInput.focus(); }
          if (e.key === 'Enter')     commitRecord();
          if (e.key === 'Escape')    { if (canLeaveCurrentRecord()) setMode('playback'); }
          if (e.key === 'ArrowUp')   { e.preventDefault(); navigateRecord(-1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); navigateRecord(1); }
        });
      }
    }, 50);
  }

  function navigateRecord(delta) {
    if (!canLeaveCurrentRecord()) return;
    const events = window.AppState.events;
    if (!events.length) return;

    let newIdx;
    if (currentIdx === -1) {
      newIdx = delta < 0 ? events.length - 1 : 0;
    } else {
      newIdx = currentIdx + delta;
      if (newIdx < 0 || newIdx >= events.length) return; // at boundary, stop
    }

    const ev = events[newIdx];
    currentIdx = newIdx;
    editingRow = { ...ev, isNew: false };

    if (player) player.currentTime(BGDL.parseWallClock(ev.wallClock));
    renderTable();
    focusCurrentRow();
  }

  function onEventDataInput(e) {
    const raw = e.target.value.trim();
    // Parse first word as eventType, rest as eventData
    const parts = raw.match(/^(\S+)\s*(.*)?$/s);
    if (parts) {
      editingRow.eventType = parts[1];
      editingRow.eventData = (parts[2] || '').trim();
    } else {
      editingRow.eventType = raw;
      editingRow.eventData = '';
    }
    // Update description cell live
    const desc = editingRow.eventType
      ? BGDL.describe(editingRow.eventType, editingRow.eventData,
          window.AppState.header.teamA.name, window.AppState.header.teamB.name)
      : '';
    const tbody = $('events-tbody');
    const currentRow = tbody.querySelector('tr.current');
    if (currentRow) currentRow.cells[2].textContent = desc;
  }

  function commitRecord() {
    if (!editingRow) return;

    const ttInput = document.getElementById('edit-timetag');
    const evInput = document.getElementById('edit-eventdata');
    if (!ttInput || !evInput) return;

    const ttVal = ttInput.value.trim();
    const evVal = evInput.value.trim();

    if (!evVal) { setMode('playback'); return; }

    // Parse time tag field
    const parsedLine = BGDL.parseDetailLine(ttVal + ' ' + evVal);
    if (!parsedLine) {
      if (confirm('This record is not valid and cannot be saved.\nDiscard it and continue?')) {
        setMode('playback');
      }
      return;
    }

    const rec = {
      wallClock: parsedLine.wallClock,
      gameClock: parsedLine.gameClock,
      eventType: parsedLine.eventType,
      eventData: parsedLine.eventData,
      raw: (ttVal + ' ' + evVal).trim()
    };

    const events = window.AppState.events;

    if (!editingRow.isNew && currentIdx >= 0) {
      // Replace existing
      events[currentIdx] = rec;
    } else {
      // Insert in sorted order by wall clock
      const wallSecs = BGDL.parseWallClock(rec.wallClock);
      let insertAt = events.length;
      for (let i = 0; i < events.length; i++) {
        if (BGDL.parseWallClock(events[i].wallClock) > wallSecs) { insertAt = i; break; }
      }
      events.splice(insertAt, 0, rec);
    }

    dirty = true;
    updateEventCount();
    setMode('playback');
  }

  function updateEventCount() {
    $('event-count').textContent = `${window.AppState.events.length} record${window.AppState.events.length !== 1 ? 's' : ''}`;
  }

  // ── Keyboard handler ─────────────────────────────────────────────────────────
  function handleKey(e) {
    // Don't intercept if typing in setup screen inputs
    if (document.getElementById('setup-screen').classList.contains('active')) return;

    // If in record mode, editing inputs handle their own keys
    if (mode === 'record') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (mode === 'playback') {
          setMode('record');
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seekBy(-5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        seekBy(5);
        break;
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function saveFile() {
    const h = window.AppState.header;
    const headerText = BGDL.generateHeader(h);
    const evLines = window.AppState.events.map(e => e.raw || '').filter(Boolean);
    const text = headerText + (evLines.length ? '\n\n' + evLines.join('\n') : '');
    const base = (h.game || 'game').replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, '_');
    const suggested = window.AppState.lastFilename || (base + '.bgdl');

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggested,
          types: [{ description: 'BGDL Files', accept: { 'text/plain': ['.bgdl'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        dirty = false;
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      }
    } else {
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = suggested;
      a.click();
      URL.revokeObjectURL(a.href);
      dirty = false;
    }
  }

  // ── Utility ─────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Public ───────────────────────────────────────────────────────────────────
  return { init, destroy, isDirty: () => dirty };

})();
