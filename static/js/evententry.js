/**
 * evententry.js — Event Entry modal.
 *
 * EventEntry.open(wallSecs, existingEvent, onConfirm)
 * EventEntry.close()
 */
const EventEntry = (() => {

  let onConfirmCb = null;
  let currentWallSecs = 0;
  let selectedType = null;
  let mode = 'gui'; // 'gui' | 'bgdl'

  const REGIONS = [
    { code: 'LC', label: 'L Corner', zone: 3 },
    { code: 'LW', label: 'L Wing',   zone: 3 },
    { code: 'TC', label: 'Top Ctr',  zone: 3 },
    { code: 'RW', label: 'R Wing',   zone: 3 },
    { code: 'RC', label: 'R Corner', zone: 3 },
    { code: 'LE', label: 'L Elbow',  zone: 2 },
    { code: 'TM', label: 'Top Mid',  zone: 2 },
    { code: 'TP', label: 'Top Paint',zone: 2 },
    { code: 'RM', label: 'R Mid',    zone: 2 },
    { code: 'RE', label: 'R Elbow',  zone: 2 },
    { code: 'LP', label: 'L Paint',  zone: 2 },
    { code: 'RIM',label: 'Rim',      zone: 2 },
    { code: 'RP', label: 'R Paint',  zone: 2 },
  ];

  function open(wallSecs, existingEvent, onConfirm) {
    onConfirmCb = onConfirm;
    currentWallSecs = wallSecs != null ? wallSecs : 0;
    selectedType = null;
    mode = 'gui';

    const modal = document.getElementById('entry-modal');
    modal.hidden = false;

    // Title
    document.getElementById('modal-title').textContent = existingEvent ? 'Edit Event' : 'Add Event';

    // Pre-fill time
    document.getElementById('entry-wallclock').value = existingEvent ? existingEvent.wallClock : BGDL.secsToWallClock(currentWallSecs);
    document.getElementById('entry-gameclock').value = existingEvent && existingEvent.gameClock ? existingEvent.gameClock.raw : '';

    // Show step 1
    showStep(1);
    setMode('gui');
    buildTypeGrid();

    // If editing, pre-select type and jump to step 2
    if (existingEvent) {
      selectType(existingEvent.type);
      buildFieldsForType(existingEvent.type, existingEvent);
      showStep(2);
    }

    // BGDL mode pre-fill
    const prefix = document.getElementById('bgdl-entry-prefix');
    prefix.textContent = existingEvent ? existingEvent.wallClock : BGDL.secsToWallClock(currentWallSecs);
    document.getElementById('bgdl-entry-input').value = existingEvent ? existingEvent.raw.replace(/^\S+\s*/, '') : '';
    validateBgdlInput();

    bindModalEvents();
  }

  function close() {
    document.getElementById('entry-modal').hidden = true;
    onConfirmCb = null;
    selectedType = null;
  }

  function bindModalEvents() {
    // Avoid duplicate listeners by replacing elements
    document.getElementById('modal-close').onclick = close;
    document.getElementById('entry-cancel').onclick = close;
    document.getElementById('modal-backdrop') || document.querySelector('.modal-backdrop').addEventListener('click', close);

    // Mode toggle
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.onclick = () => setMode(btn.dataset.mode);
    });

    // Confirm
    document.getElementById('entry-confirm').onclick = confirm;

    // Back button
    document.getElementById('entry-back').onclick = () => { selectedType = null; showStep(1); };

    // BGDL input live validation
    document.getElementById('bgdl-entry-input').oninput = validateBgdlInput;
  }

  function setMode(m) {
    mode = m;
    document.getElementById('modal-gui').hidden = m !== 'gui';
    document.getElementById('modal-bgdl').hidden = m !== 'bgdl';
    document.getElementById('entry-time-row').hidden = false; // always show time row
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    updateConfirmState();
  }

  function showStep(step) {
    document.getElementById('entry-step1').hidden = step !== 1;
    document.getElementById('entry-step2').hidden = step !== 2;
    document.getElementById('entry-time-row').hidden = step === 1;
    document.getElementById('entry-confirm').disabled = step === 1;
  }

  // ── Type grid ─────────────────────────────────────────────────────────────

  function buildTypeGrid() {
    const grid = document.getElementById('type-grid');
    grid.innerHTML = '';
    const categories = ['clock','shot','foul','violation','rebound','turnover','lineup','score'];
    const catLabels = { clock:'Clock', shot:'Shots', foul:'Fouls', violation:'Violations', rebound:'Rebound', turnover:'Turnovers', lineup:'Lineups', score:'Score' };

    for (const cat of categories) {
      const types = BGDL.EVENT_TYPES.filter(t => t.category === cat);
      if (!types.length) continue;
      const header = document.createElement('div');
      header.style.cssText = 'grid-column:1/-1;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-top:8px;';
      header.textContent = catLabels[cat];
      grid.appendChild(header);
      for (const t of types) {
        const btn = document.createElement('button');
        btn.className = 'type-btn';
        btn.innerHTML = `<span class="type-icon">${t.icon}</span><span class="type-label">${t.label}</span>`;
        btn.onclick = () => { selectType(t.type); buildFieldsForType(t.type, null); showStep(2); };
        grid.appendChild(btn);
      }
    }
  }

  function selectType(type) {
    selectedType = type;
    document.getElementById('entry-type-label').textContent =
      (BGDL.EVENT_TYPES.find(t => t.type === type) || { label: type }).label;
  }

  // ── Dynamic fields ────────────────────────────────────────────────────────

  function buildFieldsForType(type, existingEv) {
    const container = document.getElementById('entry-fields');
    container.innerHTML = '';
    const g = AppState.currentGame || {};
    const rosterA = g.roster_a || [];
    const rosterB = g.roster_b || [];

    const t = type.toLowerCase();

    // Clock events — no extra fields
    if (['start','stop','sync'].includes(t)) {
      container.innerHTML = '<p style="color:var(--text-dim);font-size:13px">No additional fields required.</p>';
      updateConfirmState();
      return;
    }

    // Score override
    if (t === 'score') {
      container.appendChild(textField('scoreA', 'Team A Score', existingEv && existingEv.scoreA != null ? existingEv.scoreA : ''));
      container.appendChild(textField('scoreB', 'Team B Score', existingEv && existingEv.scoreB != null ? existingEv.scoreB : ''));
      updateConfirmState();
      return;
    }

    // Lineup
    if (t === 'la' || t === 'lb') {
      const teamSide = t === 'la' ? 'a' : 'b';
      const roster = teamSide === 'a' ? rosterA : rosterB;
      const existing = existingEv && existingEv.players ? existingEv.players : [];
      const fieldset = document.createElement('div');
      fieldset.innerHTML = '<label style="font-size:12px;color:var(--text-dim)">Players on court (up to 5)</label>';
      for (let i = 0; i < 5; i++) {
        const val = existing[i] || '';
        if (roster.length) {
          fieldset.appendChild(playerSelect(`lineup_${i}`, `Player ${i+1}`, roster, val));
        } else {
          fieldset.appendChild(textField(`lineup_${i}`, `Player ${i+1} jersey #`, val));
        }
      }
      container.appendChild(fieldset);
      updateConfirmState();
      return;
    }

    // Violations and non-shooting fouls — team/player
    const teamPlayerTypes = ['df','of','tf','uf','dq','travel','out','back','double','shotclock','3s','5s','8s','rebound','stl','def'];
    if (teamPlayerTypes.includes(t)) {
      container.appendChild(teamToggle('team', existingEv && existingEv.teamPlayer ? existingEv.teamPlayer.team : 'A'));
      // Tech fouls can have B or C (bench/coach) instead of jersey — but still offer player select
      if (!['tf'].includes(t)) {
        const teamSide = (existingEv && existingEv.teamPlayer ? existingEv.teamPlayer.team : 'A').toLowerCase();
        const roster = teamSide === 'a' ? rosterA : rosterB;
        const jLabel = t === 'rebound' ? 'Rebounder (optional)' : 'Player jersey # (optional)';
        if (roster.length) {
          container.appendChild(playerSelect('jersey', jLabel, roster, existingEv && existingEv.teamPlayer ? (existingEv.teamPlayer.jersey || '') : '', true));
        } else {
          container.appendChild(textField('jersey', jLabel, existingEv && existingEv.teamPlayer ? (existingEv.teamPlayer.jersey || '') : ''));
        }
      } else {
        container.appendChild(textField('jersey', 'Jersey # / B (bench) / C (coach)', existingEv && existingEv.teamPlayer ? (existingEv.teamPlayer.jersey || '') : ''));
      }
      updateConfirmState();
      return;
    }

    // Turnover
    if (t === 'to') {
      container.appendChild(teamToggle('team', existingEv && existingEv.teamPlayer ? existingEv.teamPlayer.team : 'A'));
      const roster = rosterA; // will update dynamically — simplified here
      if (rosterA.length || rosterB.length) {
        container.appendChild(playerSelect('jersey', 'Player who turned it over', [], '', false, true));
      } else {
        container.appendChild(textField('jersey', 'Player jersey #', existingEv && existingEv.teamPlayer ? (existingEv.teamPlayer.jersey || '') : ''));
      }
      container.appendChild(textField('steal_jersey', 'Steal by jersey # (optional, same team)', existingEv && existingEv.steal ? (existingEv.steal.jersey || '') : ''));
      updateConfirmState();
      return;
    }

    // Shot attempts
    if (['2pt','3pt','dunk','pb','ft'].includes(t)) {
      // Team
      const teamEl = teamToggle('team', existingEv && existingEv.shooter ? existingEv.shooter.team : 'A');
      container.appendChild(teamEl);

      // Shooter
      if (rosterA.length || rosterB.length) {
        container.appendChild(playerSelect('shooter', 'Shooter', [], existingEv && existingEv.shooter ? existingEv.shooter.jersey : '', false, true));
      } else {
        container.appendChild(textField('shooter', 'Shooter jersey #', existingEv && existingEv.shooter ? existingEv.shooter.jersey : ''));
      }

      // Make/Miss
      container.appendChild(makeMissToggle(existingEv ? existingEv.made : true));

      // Assist
      container.appendChild(textField('assist', 'Assist jersey # (optional)', existingEv && existingEv.assist ? existingEv.assist : ''));

      // Foul modifier
      container.appendChild(selectField('foul_type', 'Foul (optional)', ['','SF – Shooting Foul','UF – Unsportsmanlike','DQ – Disqualifying'], existingEv && existingEv.foulType ? existingEv.foulType : ''));
      container.appendChild(textField('foul_team', 'Foul on team (A/B)', existingEv && existingEv.fouler ? existingEv.fouler.team : ''));
      container.appendChild(textField('foul_jersey', 'Fouler jersey #', existingEv && existingEv.fouler ? existingEv.fouler.jersey : ''));

      // Block
      container.appendChild(textField('block_team', 'Block by team (A/B, optional)', existingEv && existingEv.block ? existingEv.block.team : ''));
      container.appendChild(textField('block_jersey', 'Blocker jersey #', existingEv && existingEv.block ? existingEv.block.jersey : ''));

      // Location
      if (['2pt','3pt','dunk','pb'].includes(t)) {
        container.appendChild(buildRegionPicker(existingEv && existingEv.location ? existingEv.location : null));
      }

      updateConfirmState();
      return;
    }

    updateConfirmState();
  }

  // Field helpers
  function textField(id, label, value) {
    const wrap = document.createElement('div');
    wrap.className = 'entry-field';
    wrap.innerHTML = `<label>${esc(label)}<input type="text" id="ef-${id}" value="${esc(String(value))}"></label>`;
    wrap.querySelector('input').addEventListener('input', updateConfirmState);
    return wrap;
  }

  function selectField(id, label, options, value) {
    const wrap = document.createElement('div');
    wrap.className = 'entry-field';
    const opts = options.map(o => `<option value="${o.split('–')[0].trim()}" ${o.split('–')[0].trim() === value ? 'selected' : ''}>${esc(o)}</option>`).join('');
    wrap.innerHTML = `<label>${esc(label)}<select id="ef-${id}">${opts}</select></label>`;
    return wrap;
  }

  function teamToggle(id, selected) {
    const wrap = document.createElement('div');
    wrap.className = 'entry-field';
    const g = AppState.currentGame || {};
    const nameA = (g.team_a || 'Team A').split(',')[0].trim();
    const nameB = (g.team_b || 'Team B').split(',')[0].trim();
    wrap.innerHTML = `
      <label>Team</label>
      <div class="toggle-row" id="ef-${id}-wrap">
        <button type="button" class="toggle-option ${selected === 'A' ? 'active' : ''}" data-val="A">${esc(nameA)}</button>
        <button type="button" class="toggle-option ${selected === 'B' ? 'active' : ''}" data-val="B">${esc(nameB)}</button>
      </div>
      <input type="hidden" id="ef-${id}" value="${selected || 'A'}">
    `;
    wrap.querySelectorAll('.toggle-option').forEach(btn => {
      btn.onclick = () => {
        wrap.querySelectorAll('.toggle-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        wrap.querySelector(`#ef-${id}`).value = btn.dataset.val;
        updateConfirmState();
      };
    });
    return wrap;
  }

  function makeMissToggle(made) {
    const wrap = document.createElement('div');
    wrap.className = 'entry-field';
    wrap.innerHTML = `
      <label>Result</label>
      <div class="toggle-row">
        <button type="button" class="toggle-option ${made ? 'active' : ''}" data-val="1">Made</button>
        <button type="button" class="toggle-option ${!made ? 'active' : ''}" data-val="0">Missed</button>
      </div>
      <input type="hidden" id="ef-made" value="${made ? '1' : '0'}">
    `;
    wrap.querySelectorAll('.toggle-option').forEach(btn => {
      btn.onclick = () => {
        wrap.querySelectorAll('.toggle-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        wrap.querySelector('#ef-made').value = btn.dataset.val;
      };
    });
    return wrap;
  }

  function playerSelect(id, label, roster, value, optional, dynamic) {
    // Searchable dropdown backed by roster
    const wrap = document.createElement('div');
    wrap.className = 'entry-field player-select-wrap';
    const listId = `roster-list-${id}-${Date.now()}`;
    if (roster.length) {
      const options = roster.map(p => `<option value="${p.jersey}">${p.jersey}${p.name ? ' – ' + p.name : ''}</option>`).join('');
      wrap.innerHTML = `
        <label>${esc(label)}</label>
        <select id="ef-${id}" class="entry-field-select">
          ${optional ? '<option value="">— none —</option>' : ''}
          ${options}
        </select>
      `;
      if (value) {
        const sel = wrap.querySelector('select');
        sel.value = value;
      }
    } else {
      wrap.innerHTML = `<label>${esc(label)}<input type="text" id="ef-${id}" value="${esc(String(value || ''))}"></label>`;
    }
    return wrap;
  }

  function buildRegionPicker(selected) {
    const wrap = document.createElement('div');
    wrap.className = 'entry-field';
    wrap.innerHTML = '<label>Shot Location (optional)</label>';
    const grid = document.createElement('div');
    grid.className = 'region-grid';
    for (const r of REGIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `region-btn${r.zone === 3 ? ' zone-3' : ''}${r.code === selected ? ' selected' : ''}`;
      btn.textContent = r.code;
      btn.title = r.label + (r.zone === 3 ? ' (3pt)' : ' (2pt)');
      btn.dataset.code = r.code;
      btn.onclick = () => {
        grid.querySelectorAll('.region-btn').forEach(b => b.classList.remove('selected'));
        if (btn.classList.contains('selected')) {
          btn.classList.remove('selected');
        } else {
          btn.classList.add('selected');
        }
      };
      grid.appendChild(btn);
    }
    // Hidden input to track selection
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.id = 'ef-location';
    grid.addEventListener('click', () => {
      const sel = grid.querySelector('.region-btn.selected');
      hidden.value = sel ? sel.dataset.code : '';
    });
    hidden.value = selected || '';
    wrap.appendChild(grid);
    wrap.appendChild(hidden);
    return wrap;
  }

  // ── Confirm state ─────────────────────────────────────────────────────────

  function updateConfirmState() {
    const btn = document.getElementById('entry-confirm');
    if (mode === 'bgdl') {
      const preview = document.getElementById('bgdl-entry-preview');
      btn.disabled = !preview.classList.contains('valid');
    } else {
      btn.disabled = !selectedType && mode === 'gui';
    }
  }

  // ── BGDL direct mode ──────────────────────────────────────────────────────

  function validateBgdlInput() {
    const wc = document.getElementById('entry-wallclock').value.trim() ||
               document.getElementById('bgdl-entry-prefix').textContent.trim();
    const rest = document.getElementById('bgdl-entry-input').value.trim();
    const preview = document.getElementById('bgdl-entry-preview');
    if (!rest) {
      preview.textContent = '';
      preview.className = 'bgdl-entry-preview';
      updateConfirmState();
      return;
    }
    const fullLine = `${wc} ${rest}`;
    const ev = BGDL.parseEvent(fullLine);
    if (ev && ev.type !== 'unknown') {
      const g = AppState.currentGame || {};
      const tA = g.team_a ? g.team_a.split(',')[0].trim() : 'Team A';
      const tB = g.team_b ? g.team_b.split(',')[0].trim() : 'Team B';
      preview.textContent = BGDL.describe(ev, [tA, tB]);
      preview.className = 'bgdl-entry-preview valid';
    } else {
      preview.textContent = 'Unrecognised event format';
      preview.className = 'bgdl-entry-preview invalid';
    }
    updateConfirmState();
  }

  // ── Confirm / build raw ───────────────────────────────────────────────────

  function confirm() {
    const wc = document.getElementById('entry-wallclock').value.trim();
    const gc = document.getElementById('entry-gameclock').value.trim();

    let raw;
    if (mode === 'bgdl') {
      const rest = document.getElementById('bgdl-entry-input').value.trim();
      raw = `${wc}${gc ? ' ' + gc : ''} ${rest}`;
    } else {
      raw = buildRawFromGui(wc, gc);
      if (!raw) return;
    }

    close();
    if (onConfirmCb) onConfirmCb(raw);
  }

  function buildRawFromGui(wc, gc) {
    const type = selectedType;
    if (!type) return null;
    const t = type.toLowerCase();
    const fields = {};

    // Helpers
    const val = (id) => { const el = document.getElementById(`ef-${id}`); return el ? el.value.trim() : ''; };

    if (['start','stop','sync'].includes(t)) {
      return `${wc}${gc ? ' ' + gc : ''} ${type}`;
    }

    if (t === 'score') {
      return `${wc}${gc ? ' ' + gc : ''} score ${val('scoreA')} - ${val('scoreB')}`;
    }

    if (t === 'la' || t === 'lb') {
      const players = [];
      for (let i = 0; i < 5; i++) {
        const v = val(`lineup_${i}`);
        if (v) players.push(v);
      }
      return `${wc}${gc ? ' ' + gc : ''} ${type} ${players.join(',')}`;
    }

    if (t === 'to') {
      const team = val('team');
      const jersey = val('jersey');
      const steal = val('steal_jersey');
      let s = `${wc}${gc ? ' ' + gc : ''} to ${team}${jersey}`;
      if (steal) s += ` STL ${team === 'A' ? 'B' : 'A'}${steal}`; // simplified
      return s;
    }

    // Team+player events
    if (['df','of','tf','uf','dq','travel','out','back','double','shotclock','3s','5s','8s','rebound','stl','def'].includes(t)) {
      const team = val('team');
      const jersey = val('jersey');
      return `${wc}${gc ? ' ' + gc : ''} ${type} ${team}${jersey}`;
    }

    // Shot
    if (['2pt','3pt','dunk','pb','ft'].includes(t)) {
      const team = val('team') || 'A';
      const shooter = val('shooter');
      const made = val('made') === '1';
      const assist = val('assist');
      const foulType = val('foul_type');
      const foulTeam = val('foul_team');
      const foulJersey = val('foul_jersey');
      const blockTeam = val('block_team');
      const blockJersey = val('block_jersey');
      const location = val('location');

      let s = `${wc}${gc ? ' ' + gc : ''} ${type}${made ? '+' : '-'}${team}${shooter}`;
      if (assist) s += `+${assist}`;
      if (foulType && foulTeam) s += `${foulType}${foulTeam}${foulJersey}`;
      if (blockTeam && blockJersey) s += `BL${blockTeam}${blockJersey}`;
      if (location) s += ` @${location}`;
      return s;
    }

    return `${wc}${gc ? ' ' + gc : ''} ${type}`;
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { open, close };
})();
