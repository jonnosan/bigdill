// ── Setup Screen Logic ────────────────────────────────────────────────────────

(function () {
  'use strict';

  // Shared game state object (read by gamedata.js too)
  window.AppState = {
    header: {
      game: '', date: '', video: '',
      teamA: { name: 'Team A', color: '' },
      teamB: { name: 'Team B', color: '' },
      periods: { count: 4, duration: 10, overtime: 5 },
      runningClock: false
    },
    events: [],   // parsed BGDL detail records
    lastFilename: null  // filename from last load or save
  };

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const inputs = {
    gameName:   $('game-name'),
    gameDate:   $('game-date'),
    teamAName:  $('team-a-name'),
    teamAColor: $('team-a-color'),
    teamBName:  $('team-b-name'),
    teamBColor: $('team-b-color'),
    periodCount:    $('period-count'),
    periodDuration: $('period-duration'),
    overtimeDuration: $('overtime-duration'),
    videoUrl:   $('video-url'),
    runningClock: $('running-clock')
  };

  const swatchA = $('team-a-swatch');
  const swatchB = $('team-b-swatch');

  // ── Swatch colours ──────────────────────────────────────────────────────────
  const CSS_COLOR_NAMES = [
    'aqua','black','blue','fuchsia','gray','green','lime','maroon','navy',
    'olive','orange','purple','red','silver','teal','white','yellow',
    'gold','pink','brown','violet','cyan','magenta','indigo','coral','crimson'
  ];

  function colorToCss(name) {
    if (!name) return '';
    const lower = name.trim().toLowerCase();
    if (CSS_COLOR_NAMES.includes(lower)) return lower;
    // Try hex
    if (/^#[0-9a-f]{3,6}$/i.test(lower)) return lower;
    return lower; // browser will ignore unknown values gracefully
  }

  function updateSwatch(input, swatch) {
    const c = colorToCss(input.value);
    swatch.style.background = c || '#333';
    swatch.style.borderColor = c ? '#aaa' : '#444';
  }

  inputs.teamAColor.addEventListener('input', () => updateSwatch(inputs.teamAColor, swatchA));
  inputs.teamBColor.addEventListener('input', () => updateSwatch(inputs.teamBColor, swatchB));

  // ── Read form → header ──────────────────────────────────────────────────────
  function readForm() {
    const h = window.AppState.header;
    h.game  = inputs.gameName.value.trim();
    h.date  = inputs.gameDate.value.trim();
    h.video = inputs.videoUrl.value.trim();
    h.teamA.name  = inputs.teamAName.value.trim()  || 'Team A';
    h.teamA.color = inputs.teamAColor.value.trim();
    h.teamB.name  = inputs.teamBName.value.trim()  || 'Team B';
    h.teamB.color = inputs.teamBColor.value.trim();
    h.periods.count    = parseInt(inputs.periodCount.value)    || 4;
    h.periods.duration = parseInt(inputs.periodDuration.value) || 10;
    h.periods.overtime = parseInt(inputs.overtimeDuration.value) || 5;
    h.runningClock = inputs.runningClock.checked;
    return h;
  }

  // ── Write header → form ─────────────────────────────────────────────────────
  function populateForm(header) {
    inputs.gameName.value         = header.game  || '';
    inputs.gameDate.value         = header.date  || '';
    inputs.videoUrl.value         = header.video || '';
    inputs.teamAName.value        = header.teamA.name  || '';
    inputs.teamAColor.value       = header.teamA.color || '';
    inputs.teamBName.value        = header.teamB.name  || '';
    inputs.teamBColor.value       = header.teamB.color || '';
    inputs.periodCount.value      = String(header.periods.count    || 4);
    inputs.periodDuration.value   = String(header.periods.duration || 10);
    inputs.overtimeDuration.value = String(header.periods.overtime || 5);
    inputs.runningClock.checked   = !!header.runningClock;

    updateSwatch(inputs.teamAColor, swatchA);
    updateSwatch(inputs.teamBColor, swatchB);
  }

  // ── Events button validation ────────────────────────────────────────────────
  function isValidVideoUrl(url) {
    if (!url) return false;
    if (/youtube\.com|youtu\.be/i.test(url)) return true;
    if (/\.m3u8/i.test(url)) return true;
    if (/\.mpd/i.test(url))  return true;
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    return ['mp4', 'mov', 'webm'].includes(ext);
  }

  function validateBtn() {
    const urlRaw = inputs.videoUrl.value.trim();
    const urlOk  = isValidVideoUrl(urlRaw);
    const warn   = $('video-url-warning');
    if (urlRaw && !urlOk) {
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
    const ok = inputs.gameName.value.trim() !== ''
            && inputs.teamAName.value.trim() !== ''
            && inputs.teamBName.value.trim() !== ''
            && urlOk;
    $('btn-details').disabled = !ok;
  }

  [inputs.gameName, inputs.teamAName, inputs.teamBName, inputs.videoUrl]
    .forEach(el => el.addEventListener('input', validateBtn));

  validateBtn();

  // ── Save ────────────────────────────────────────────────────────────────────
  $('btn-save').addEventListener('click', async () => {
    readForm();
    const text = buildBGDLText();

    // Use File System Access API if available
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedFilename(),
          types: [{ description: 'BGDL Files', accept: { 'text/plain': ['.bgdl'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        window.AppState.lastFilename = handle.name;
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      }
    } else {
      // Fallback: download
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = suggestedFilename();
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });

  function suggestedFilename() {
    const h = window.AppState.header;
    const base = (h.game || 'game').replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, '_');
    return base + '.bgdl';
  }

  function buildBGDLText() {
    const headerText = BGDL.generateHeader(window.AppState.header);
    const evLines = window.AppState.events.map(e => e.raw || '').filter(Boolean);
    return headerText + (evLines.length ? '\n\n' + evLines.join('\n') : '');
  }

  // ── Load ────────────────────────────────────────────────────────────────────
  $('btn-load').addEventListener('click', () => {
    $('file-input-load').click();
  });

  $('file-input-load').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = BGDL.parse(text);
    window.AppState.header = parsed.header;
    window.AppState.events = parsed.events;
    window.AppState.lastFilename = file.name;
    populateForm(parsed.header);
    validateBtn();
    // reset file input so same file can be reloaded
    e.target.value = '';
  });

  // ── Details → switch to Game Data screen ───────────────────────────────────
  $('btn-details').addEventListener('click', () => {
    readForm();
    switchScreen('gamedata-screen');
    // Let gamedata.js know it should initialise
    if (typeof GameData !== 'undefined') GameData.init();
  });

  // ── Back from Game Data ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    $('btn-back').addEventListener('click', () => {
      switchScreen('setup-screen');
      if (typeof GameData !== 'undefined') GameData.destroy();
    });
  });

  // ── Screen switching helper ─────────────────────────────────────────────────
  function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  window.switchScreen = switchScreen;

})();
