/**
 * setup.js — Game Setup screen.
 * Handles header fields, rosters, Running Clock setting.
 */
const Setup = (() => {

  const COLOURS = [
    { value: '',        label: '(none)',   css: null },
    { value: 'Black',   label: 'Black',   css: '#111111' },
    { value: 'Blue',    label: 'Blue',    css: '#2980b9' },
    { value: 'Gold',    label: 'Gold',    css: '#d4ac0d' },
    { value: 'Green',   label: 'Green',   css: '#27ae60' },
    { value: 'Grey',    label: 'Grey',    css: '#7f8c8d' },
    { value: 'Maroon',  label: 'Maroon',  css: '#7b241c' },
    { value: 'Navy',    label: 'Navy',    css: '#1a3a6c' },
    { value: 'Orange',  label: 'Orange',  css: '#e67e22' },
    { value: 'Pink',    label: 'Pink',    css: '#fd79a8' },
    { value: 'Purple',  label: 'Purple',  css: '#8e44ad' },
    { value: 'Red',     label: 'Red',     css: '#e74c3c' },
    { value: 'Teal',    label: 'Teal',    css: '#1abc9c' },
    { value: 'White',   label: 'White',   css: '#ecf0f1' },
    { value: 'Yellow',  label: 'Yellow',  css: '#f1c40f' },
  ];

  function initColourPicker(containerId, selected) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    container.dataset.value = selected || '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'colour-select-btn';
    btn.innerHTML = swatchHtml(selected) + `<span class="colour-label">${colourLabel(selected)}</span>`;

    const dropdown = document.createElement('div');
    dropdown.className = 'colour-dropdown';
    dropdown.hidden = true;

    for (const c of COLOURS) {
      const opt = document.createElement('div');
      opt.className = 'colour-option' + (c.value === selected ? ' selected' : '');
      opt.innerHTML = swatchHtml(c.value) + `<span>${c.label}</span>`;
      opt.addEventListener('click', () => {
        container.dataset.value = c.value;
        btn.innerHTML = swatchHtml(c.value) + `<span class="colour-label">${c.label}</span>`;
        dropdown.querySelectorAll('.colour-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        dropdown.hidden = true;
      });
      dropdown.appendChild(opt);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close any other open pickers
      document.querySelectorAll('.colour-dropdown').forEach(d => { if (d !== dropdown) d.hidden = true; });
      dropdown.hidden = !dropdown.hidden;
    });

    container.appendChild(btn);
    container.appendChild(dropdown);
  }

  function swatchHtml(value) {
    const c = COLOURS.find(c => c.value === (value || ''));
    if (!c || !c.css) return '<span class="colour-swatch colour-swatch-none"></span>';
    return `<span class="colour-swatch" style="background:${c.css}"></span>`;
  }

  function colourLabel(value) {
    const c = COLOURS.find(c => c.value === (value || ''));
    return c ? c.label : '(none)';
  }

  function getColourValue(containerId) {
    return document.getElementById(containerId).dataset.value || '';
  }

  // Per-team roster state: { a: [...], b: [...] }
  const rosters = { a: [], b: [] };

  function init(game) {
    populateFields(game || {});
    renderRoster('a');
    renderRoster('b');
    bindEvents();
  }

  function populateFields(game) {
    document.getElementById('f-game-name').value = game.game_name || '';
    document.getElementById('f-game-id').value = game.game_id_tag || '';
    document.getElementById('f-date').value = isoToDatetimeLocal(game.date || '');
    const periodsRaw = game.periods || '4x10+5';
    const plusIdx = periodsRaw.indexOf('+');
    const periodsFormat = plusIdx !== -1 ? periodsRaw.slice(0, plusIdx).trim() : periodsRaw.trim() || '4x10';
    const overtime = plusIdx !== -1 ? periodsRaw.slice(plusIdx + 1).trim() : '5';
    const sel = document.getElementById('f-periods-format');
    sel.value = periodsFormat;
    if (!sel.value) sel.value = '4x10'; // fallback if stored value not in list
    document.getElementById('f-overtime').value = overtime;
    document.getElementById('f-video').value = game.video_url || '';
    const [teamAName, teamAColour] = splitTeam(game.team_a || '');
    const [teamBName, teamBColour] = splitTeam(game.team_b || '');
    document.getElementById('f-team-a-name').value = teamAName;
    initColourPicker('f-team-a-colour', teamAColour);
    document.getElementById('f-team-b-name').value = teamBName;
    initColourPicker('f-team-b-colour', teamBColour);
    document.getElementById('f-running-clock').checked = !!game.running_clock;
    rosters.a = Array.isArray(game.roster_a) ? [...game.roster_a] : [];
    rosters.b = Array.isArray(game.roster_b) ? [...game.roster_b] : [];
  }

  function splitTeam(raw) {
    const comma = raw.indexOf(',');
    if (comma === -1) return [raw.trim(), ''];
    return [raw.slice(0, comma).trim(), raw.slice(comma + 1).trim()];
  }

  function joinTeam(nameId, colourId) {
    const name = document.getElementById(nameId).value.trim();
    const colour = getColourValue(colourId);
    return colour ? `${name},${colour}` : name;
  }

  function isoToDatetimeLocal(iso) {
    if (!iso) return '';
    // "2025-08-24T11:00:00+10:00" → "2025-08-24T11:00"
    return iso.slice(0, 16);
  }

  function collectFields() {
    const dateVal = document.getElementById('f-date').value;
    return {
      game_name: document.getElementById('f-game-name').value.trim(),
      game_id_tag: document.getElementById('f-game-id').value.trim(),
      date: dateVal,
      periods: (() => {
        const fmt = document.getElementById('f-periods-format').value;
        const ot = document.getElementById('f-overtime').value.trim();
        return ot ? `${fmt}+${ot}` : fmt;
      })(),
      video_url: document.getElementById('f-video').value.trim(),
      team_a: joinTeam('f-team-a-name', 'f-team-a-colour'),
      team_b: joinTeam('f-team-b-name', 'f-team-b-colour'),
      running_clock: document.getElementById('f-running-clock').checked,
      roster_a: rosters.a,
      roster_b: rosters.b,
    };
  }

  // ── Roster rendering ──────────────────────────────────────────────────────

  function renderRoster(team) {
    const tbody = document.getElementById(`roster-tbody-${team}`);
    const countEl = document.getElementById(`roster-count-${team}`);
    tbody.innerHTML = '';
    for (let i = 0; i < rosters[team].length; i++) {
      const p = rosters[team][i];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(p.jersey)}</td>
        <td>${esc(p.name || '')}</td>
        <td>${esc(p.player_id || '')}</td>
        <td><button class="btn btn-sm btn-secondary" data-team="${team}" data-action="remove-player" data-idx="${i}">✕</button></td>
      `;
      tbody.appendChild(tr);
    }
    countEl.textContent = `(${rosters[team].length} player${rosters[team].length !== 1 ? 's' : ''})`;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  function bindEvents() {
    document.getElementById('btn-setup-cancel').onclick = () => AppState.navigate('gamelist');

    document.getElementById('btn-setup-save').onclick = async () => {
      const data = collectFields();
      if (!data.game_name) {
        alert('Game name is required.');
        return;
      }
      if (!data.video_url) {
        alert('Video URL is required.');
        return;
      }
      let game;
      try {
        const current = AppState.currentGame;
        if (current && current.id) {
          game = await API.updateGame(current.id, data);
        } else {
          game = await API.createGame(data);
        }
      } catch (err) {
        alert('Save failed: ' + err.message);
        return;
      }
      AppState.navigate('gameevents', game);
    };

    // Roster toggles
    document.querySelectorAll('.roster-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const team = btn.dataset.team;
        const body = document.getElementById(`roster-body-${team}`);
        const open = !body.hidden;
        body.hidden = open;
        btn.classList.toggle('open', !open);
      });
    });

    // Roster action delegation
    document.getElementById('setup-screen').addEventListener('click', handleRosterClick);

    // Video preview
    document.getElementById('btn-preview-video').addEventListener('click', toggleVideoPreview);

    // Close colour dropdowns on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.colour-dropdown').forEach(d => d.hidden = true);
    });
  }

  function toggleVideoPreview() {
    const area = document.getElementById('video-preview-area');
    const btn = document.getElementById('btn-preview-video');
    if (!area.hidden) {
      area.innerHTML = '';
      area.hidden = true;
      btn.textContent = 'Preview';
      return;
    }
    const url = document.getElementById('f-video').value.trim();
    if (!url) { alert('Enter a video URL first.'); return; }

    area.innerHTML = '';
    const ytMatch = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
    if (ytMatch) {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${ytMatch[1]}`;
      iframe.className = 'video-preview-iframe';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      area.appendChild(iframe);
    } else {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.className = 'video-preview-native';
      area.appendChild(video);
    }

    area.hidden = false;
    btn.textContent = 'Close Preview';
  }

  function handleRosterClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, team } = btn.dataset;

    if (action === 'add-player') {
      const form = document.getElementById(`roster-add-form-${team}`);
      const jersey = form.querySelector('.roster-input-jersey').value.trim();
      const name = form.querySelector('.roster-input-name').value.trim();
      const pid = form.querySelector('.roster-input-pid').value.trim();
      if (!jersey) { alert('Jersey number is required.'); return; }
      rosters[team].push({ jersey, name, player_id: pid });
      form.querySelector('.roster-input-jersey').value = '';
      form.querySelector('.roster-input-name').value = '';
      form.querySelector('.roster-input-pid').value = '';
      renderRoster(team);
    }

    if (action === 'remove-player') {
      const idx = parseInt(btn.dataset.idx, 10);
      rosters[team].splice(idx, 1);
      renderRoster(team);
    }

    if (action === 'paste-open') {
      document.getElementById(`roster-paste-area-${team}`).hidden = false;
    }

    if (action === 'paste-cancel') {
      const area = document.getElementById(`roster-paste-area-${team}`);
      area.querySelector('textarea').value = '';
      area.hidden = true;
    }

    if (action === 'paste-apply') {
      const area = document.getElementById(`roster-paste-area-${team}`);
      const text = area.querySelector('textarea').value;
      let added = 0;
      for (const line of text.split('\n')) {
        const parts = line.split(',').map(p => p.trim());
        if (!parts[0]) continue;
        rosters[team].push({ jersey: parts[0], name: parts[1] || '', player_id: parts[2] || '' });
        added++;
      }
      area.querySelector('textarea').value = '';
      area.hidden = true;
      renderRoster(team);
      if (added) alert(`Added ${added} player(s).`);
    }
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init };
})();
