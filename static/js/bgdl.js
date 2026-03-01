/**
 * bgdl.js — BGDL format parser, generator, and describer.
 *
 * Public API:
 *   BGDL.parse(text)              → { header, events[] }
 *   BGDL.generate(header, events) → string
 *   BGDL.describe(event)          → human-readable string
 *   BGDL.wallClockToSecs(str)     → number (seconds) or null
 *   BGDL.secsToWallClock(secs)    → "m:ss" string
 */
const BGDL = (() => {

  // ── Wall clock parsing ──────────────────────────────────────────────────────
  // Format: [HH:]MM:SS[.fff]
  function wallClockToSecs(str) {
    if (!str) return null;
    str = str.trim();
    const m = str.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
    if (!m) return null;
    const h = parseInt(m[1] || '0', 10);
    const min = parseInt(m[2], 10);
    const sec = parseInt(m[3], 10);
    const frac = m[4] ? parseFloat('0.' + m[4]) : 0;
    return h * 3600 + min * 60 + sec + frac;
  }

  function secsToWallClock(secs) {
    if (secs == null || isNaN(secs)) return '0:00';
    secs = Math.floor(secs);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ── Game clock parsing ──────────────────────────────────────────────────────
  // Format: P<n>T<mm:ss[.fff]>  (case-insensitive)
  function parseGameClock(str) {
    if (!str) return null;
    const m = str.trim().match(/^[Pp](\d+)[Tt](\d{1,2}):(\d{2})(?:\.(\d+))?$/);
    if (!m) return null;
    const period = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = parseInt(m[3], 10);
    const frac = m[4] ? parseFloat('0.' + m[4]) : 0;
    return { period, secs: min * 60 + sec + frac, raw: str.trim() };
  }

  // ── Event line parsing ──────────────────────────────────────────────────────
  const HEADER_TAGS = /^(GAME_ID|GAME|DATE|PERIODS|VIDEO|A|B)\s*:/i;

  // Team + jersey: A15, b 27, A (team only)
  function parseTeamPlayer(s) {
    s = s.trim();
    const m = s.match(/^([AaBb])\s*(\d+)?/);
    if (!m) return null;
    return { team: m[1].toUpperCase(), jersey: m[2] || null };
  }

  function parseEvent(line) {
    const original = line;
    line = line.trim();

    // Wall clock at start (mandatory)
    const wcMatch = line.match(/^(\d{1,2}(?::\d{2}){1,2}(?:\.\d+)?)/);
    if (!wcMatch) return null;
    let rest = line.slice(wcMatch[1].length).trimStart();
    const wallClock = wcMatch[1];
    const wallSecs = wallClockToSecs(wallClock);

    // Optional game clock
    let gameClock = null;
    const gcMatch = rest.match(/^([Pp]\d+[Tt]\d{1,2}:\d{2}(?:\.\d+)?)\s*/);
    if (gcMatch) {
      gameClock = parseGameClock(gcMatch[1]);
      rest = rest.slice(gcMatch[1].length).trimStart();
    }

    // Remove inline comment
    const commentIdx = rest.indexOf('#');
    if (commentIdx !== -1) rest = rest.slice(0, commentIdx).trimEnd();

    if (!rest) return null;

    const type = parseEventType(rest);
    return {
      wallClock,
      wallSecs,
      gameClock,
      type: type.type,
      raw: original,
      ...type.fields,
    };
  }

  function parseEventType(rest) {
    const lower = rest.toLowerCase();

    // Clock events
    if (/^start\b/i.test(rest)) return { type: 'start', fields: {} };
    if (/^stop\b/i.test(rest)) return { type: 'stop', fields: {} };
    if (/^sync\b/i.test(rest)) return { type: 'sync', fields: {} };

    // Lineups
    if (/^la\b/i.test(rest)) return { type: 'la', fields: parseLineup(rest.slice(2).trim()) };
    if (/^lb\b/i.test(rest)) return { type: 'lb', fields: parseLineup(rest.slice(2).trim()) };

    // Violations
    for (const code of ['shotclock', 'travel', 'double', 'back', 'out', '3s', '5s', '8s']) {
      if (lower.startsWith(code)) {
        const tp = parseTeamPlayer(rest.slice(code.length).trim());
        return { type: code, fields: { teamPlayer: tp } };
      }
    }

    // Score override
    if (/^score\b/i.test(rest)) {
      const m = rest.match(/score\s+(\d+)\s*-\s*(\d+)/i);
      return { type: 'score', fields: { scoreA: m ? parseInt(m[1]) : null, scoreB: m ? parseInt(m[2]) : null } };
    }

    // Fouls (non-shooting)
    for (const code of ['df', 'of', 'tf', 'uf', 'dq']) {
      if (lower.startsWith(code + ' ') || lower === code) {
        const tp = parseTeamPlayer(rest.slice(code.length).trim());
        return { type: code, fields: { teamPlayer: tp } };
      }
    }

    // Turnover / steal / deflection
    if (/^to\b/i.test(rest)) return { type: 'to', fields: parseTurnover(rest) };
    if (/^stl\b/i.test(rest)) return { type: 'stl', fields: { teamPlayer: parseTeamPlayer(rest.slice(3).trim()) } };
    if (/^def\b/i.test(rest)) return { type: 'def', fields: { teamPlayer: parseTeamPlayer(rest.slice(3).trim()) } };

    // Rebound
    if (/^rebound\b/i.test(rest)) return { type: 'rebound', fields: { teamPlayer: parseTeamPlayer(rest.slice(7).trim()) } };

    // Shot attempts
    for (const code of ['dunk', '2pt', '3pt', 'pb', 'ft']) {
      if (lower.startsWith(code)) {
        return { type: code, fields: parseShot(rest) };
      }
    }

    return { type: 'unknown', fields: { raw: rest } };
  }

  function parseLineup(s) {
    return { players: s.split(',').map(p => p.trim()).filter(Boolean) };
  }

  function parseTurnover(s) {
    const fields = {};
    // "to B43 STL A1"
    const toMatch = s.match(/^to\s+([AaBb]\s*\d+)/i);
    if (toMatch) fields.teamPlayer = parseTeamPlayer(toMatch[1]);
    const stlMatch = s.match(/STL\s+([AaBb]\s*\d+)/i);
    if (stlMatch) fields.steal = parseTeamPlayer(stlMatch[1]);
    return fields;
  }

  function parseShot(s) {
    // e.g. "2pt+A15+8SFB19 @rim"  or  "ft-"
    const fields = {};

    // Shot type
    const typeMatch = s.match(/^(\w+)/);
    if (!typeMatch) return fields;
    const after = s.slice(typeMatch[1].length);

    // Make/miss
    const mmMatch = after.match(/^([+\-])/);
    if (mmMatch) {
      fields.made = mmMatch[1] === '+';
      let rest = after.slice(1);

      // Shooter: team+jersey
      const shooterMatch = rest.match(/^([AaBb])\s*(\d+)/);
      if (shooterMatch) {
        fields.shooter = { team: shooterMatch[1].toUpperCase(), jersey: shooterMatch[2] };
        rest = rest.slice(shooterMatch[0].length);
      } else if (/^[+\-@\s]|$/.test(rest) || rest === '') {
        // FT with no shooter specified
      }

      // Assist: +<jersey>
      const assistMatch = rest.match(/^\+(\d+)/);
      if (assistMatch) {
        fields.assist = assistMatch[1];
        rest = rest.slice(assistMatch[0].length);
      }

      // Foul modifier: SF/UF/DQ followed by team+jersey
      const foulMatch = rest.match(/^(SF|UF|DQ)([AaBb]\s*\d+)/i);
      if (foulMatch) {
        fields.foulType = foulMatch[1].toUpperCase();
        fields.fouler = parseTeamPlayer(foulMatch[2]);
        rest = rest.slice(foulMatch[0].length);
      }

      // Block: BL followed by team+jersey
      const blockMatch = rest.match(/BL\s*([AaBb]\s*\d+)/i);
      if (blockMatch) {
        fields.block = parseTeamPlayer(blockMatch[1]);
      }

      // Location: @<code>
      const locMatch = s.match(/@([A-Za-z]+)/);
      if (locMatch) fields.location = locMatch[1].toUpperCase();
    }

    return fields;
  }

  // ── parse() ────────────────────────────────────────────────────────────────
  function parse(text) {
    const header = {};
    const events = [];
    let inEvents = false;

    for (const line of text.split('\n')) {
      const stripped = line.trim();
      if (!stripped || stripped.startsWith('#')) continue;

      if (!inEvents && HEADER_TAGS.test(stripped)) {
        const colonIdx = stripped.indexOf(':');
        const tag = stripped.slice(0, colonIdx).trim().toUpperCase();
        const value = stripped.slice(colonIdx + 1).trim();
        const keyMap = { GAME: 'game', GAME_ID: 'game_id', DATE: 'date', PERIODS: 'periods', VIDEO: 'video', A: 'team_a', B: 'team_b' };
        if (keyMap[tag]) header[keyMap[tag]] = value;
      } else {
        inEvents = true;
        const ev = parseEvent(stripped);
        if (ev) events.push(ev);
      }
    }

    return { header, events };
  }

  // ── generate() ─────────────────────────────────────────────────────────────
  function generate(header, events) {
    const lines = [];
    if (header.game) lines.push(`GAME: ${header.game}`);
    if (header.game_id) lines.push(`GAME_ID: ${header.game_id}`);
    if (header.date) lines.push(`DATE: ${header.date}`);
    if (header.periods) lines.push(`PERIODS: ${header.periods}`);
    if (header.video) lines.push(`VIDEO: ${header.video}`);
    if (header.team_a) lines.push(`A: ${header.team_a}`);
    if (header.team_b) lines.push(`B: ${header.team_b}`);
    lines.push('');
    for (const ev of events) {
      lines.push(ev.raw || eventToLine(ev));
    }
    return lines.join('\n');
  }

  function eventToLine(ev) {
    let s = ev.wallClock;
    if (ev.gameClock) s += ` ${ev.gameClock.raw}`;
    s += ` ${ev.type}`;
    // Could be expanded for each type — for now raw is always set from parse
    return s;
  }

  // ── describe() ─────────────────────────────────────────────────────────────
  const FOUL_NAMES = { df: 'defensive foul', of: 'offensive foul', tf: 'technical foul', uf: 'unsportsmanlike foul', dq: 'disqualifying foul', SF: 'shooting foul', UF: 'unsportsmanlike shooting foul', DQ: 'disqualifying shooting foul' };
  const VIOLATION_NAMES = { travel: 'travel', out: 'out of bounds', back: 'backcourt violation', double: 'double dribble', shotclock: 'shot clock violation', '3s': '3-second violation', '5s': '5-second violation', '8s': '8-second violation' };
  const SHOT_NAMES = { '2pt': '2-point', '3pt': '3-point', dunk: 'dunk', pb: 'put-back', ft: 'free throw' };

  function playerStr(tp, teamNames) {
    if (!tp) return '';
    const name = tp.team === 'A' ? (teamNames && teamNames[0] ? teamNames[0] : 'Team A') : (teamNames && teamNames[1] ? teamNames[1] : 'Team B');
    return tp.jersey ? `${name} #${tp.jersey}` : name;
  }

  function describe(ev, teamNames) {
    if (!ev) return '';
    const t = ev.type.toLowerCase();

    if (t === 'start') return 'Clock started';
    if (t === 'stop') return 'Clock stopped';
    if (t === 'sync') return 'Clock sync';

    if (t === 'la' || t === 'lb') {
      const team = t === 'la' ? (teamNames && teamNames[0] ? teamNames[0] : 'Team A') : (teamNames && teamNames[1] ? teamNames[1] : 'Team B');
      const players = ev.players ? ev.players.join(', ') : '';
      return `${team} lineup: ${players || '(none)'}`;
    }

    if (VIOLATION_NAMES[t]) {
      const tp = ev.teamPlayer;
      return `${VIOLATION_NAMES[t]}${tp ? ' — ' + playerStr(tp, teamNames) : ''}`;
    }

    if (FOUL_NAMES[t]) {
      const tp = ev.teamPlayer;
      return `${FOUL_NAMES[t]}${tp ? ' on ' + playerStr(tp, teamNames) : ''}`;
    }

    if (t === 'to') {
      let s = `Turnover by ${ev.teamPlayer ? playerStr(ev.teamPlayer, teamNames) : 'unknown'}`;
      if (ev.steal) s += `, steal by ${playerStr(ev.steal, teamNames)}`;
      return s;
    }
    if (t === 'stl') return `Steal by ${playerStr(ev.teamPlayer, teamNames)}`;
    if (t === 'def') return `Deflection by ${playerStr(ev.teamPlayer, teamNames)}`;
    if (t === 'rebound') return `Rebound${ev.teamPlayer ? ' by ' + playerStr(ev.teamPlayer, teamNames) : ''}`;

    if (t === 'score') return `Score override: ${ev.scoreA} – ${ev.scoreB}`;

    if (SHOT_NAMES[t]) {
      const shotName = SHOT_NAMES[t];
      const shooter = ev.shooter ? playerStr(ev.shooter, teamNames) : '';
      const madeStr = ev.made ? 'make' : 'miss';
      let s = `${shotName} ${madeStr}${shooter ? ' by ' + shooter : ''}`;
      if (ev.assist) s += `, assist #${ev.assist}`;
      if (ev.foulType) s += `; ${FOUL_NAMES[ev.foulType] || ev.foulType} on ${ev.fouler ? playerStr(ev.fouler, teamNames) : '?'}`;
      if (ev.block) s += `; blocked by ${playerStr(ev.block, teamNames)}`;
      if (ev.location) s += ` @${ev.location}`;
      return s;
    }

    return ev.raw || ev.type;
  }

  // ── Event type metadata (used by event entry form) ──────────────────────────
  const EVENT_TYPES = [
    { type: 'start',     label: 'Clock Start',   icon: '▶',  category: 'clock' },
    { type: 'stop',      label: 'Clock Stop',    icon: '⏹',  category: 'clock' },
    { type: 'sync',      label: 'Clock Sync',    icon: '⏱',  category: 'clock' },
    { type: '2pt',       label: '2pt Shot',      icon: '🏀', category: 'shot' },
    { type: '3pt',       label: '3pt Shot',      icon: '🎯', category: 'shot' },
    { type: 'dunk',      label: 'Dunk',          icon: '💪', category: 'shot' },
    { type: 'pb',        label: 'Put Back',      icon: '↩',  category: 'shot' },
    { type: 'ft',        label: 'Free Throw',    icon: '⭕', category: 'shot' },
    { type: 'df',        label: 'Def Foul',      icon: '🚫', category: 'foul' },
    { type: 'of',        label: 'Off Foul',      icon: '🚫', category: 'foul' },
    { type: 'tf',        label: 'Tech Foul',     icon: '⚡', category: 'foul' },
    { type: 'uf',        label: 'Unsports. Foul',icon: '⚠',  category: 'foul' },
    { type: 'dq',        label: 'Disq. Foul',    icon: '🔴', category: 'foul' },
    { type: 'travel',    label: 'Travel',        icon: '🚶', category: 'violation' },
    { type: 'out',       label: 'Out of Bounds', icon: '⬛', category: 'violation' },
    { type: 'back',      label: 'Backcourt',     icon: '↩',  category: 'violation' },
    { type: 'double',    label: 'Double Dribble',icon: '✋', category: 'violation' },
    { type: 'shotclock', label: 'Shot Clock',    icon: '⏰', category: 'violation' },
    { type: '3s',        label: '3-Second',      icon: '3',  category: 'violation' },
    { type: '5s',        label: '5-Second',      icon: '5',  category: 'violation' },
    { type: '8s',        label: '8-Second',      icon: '8',  category: 'violation' },
    { type: 'rebound',   label: 'Rebound',       icon: '🔄', category: 'rebound' },
    { type: 'to',        label: 'Turnover',      icon: '❌', category: 'turnover' },
    { type: 'def',       label: 'Deflection',    icon: '✋', category: 'turnover' },
    { type: 'la',        label: 'Team A Lineup', icon: '👥', category: 'lineup' },
    { type: 'lb',        label: 'Team B Lineup', icon: '👥', category: 'lineup' },
    { type: 'score',     label: 'Score Override',icon: '📝', category: 'score' },
  ];

  const CATEGORY_COLORS = {
    clock: 'badge-clock', shot: 'badge-shot', foul: 'badge-foul',
    violation: 'badge-violation', lineup: 'badge-lineup', rebound: 'badge-rebound',
    turnover: 'badge-turnover', score: 'badge-score',
  };

  function eventCategory(type) {
    const meta = EVENT_TYPES.find(e => e.type === type.toLowerCase());
    return meta ? meta.category : 'score';
  }

  function badgeClass(type) {
    return CATEGORY_COLORS[eventCategory(type)] || 'badge-score';
  }

  // Build a raw event line from structured fields
  function buildRaw(wallClock, gameClock, type, fields) {
    let s = wallClock;
    if (gameClock) s += ` ${gameClock}`;
    s += ` ${type}`;

    if (['start','stop','sync'].includes(type)) return s;

    if (type === 'la' || type === 'lb') {
      if (fields.players && fields.players.length) s += ' ' + fields.players.join(',');
      return s;
    }

    if (type === 'score') {
      s += ` ${fields.scoreA} - ${fields.scoreB}`;
      return s;
    }

    if (type === 'to') {
      if (fields.teamPlayer) s += ` ${fields.teamPlayer.team}${fields.teamPlayer.jersey || ''}`;
      if (fields.steal) s += ` STL ${fields.steal.team}${fields.steal.jersey || ''}`;
      return s;
    }

    if (['df','of','tf','uf','dq','rebound','travel','out','back','double','shotclock','3s','5s','8s','stl','def'].includes(type)) {
      if (fields.teamPlayer) s += ` ${fields.teamPlayer.team}${fields.teamPlayer.jersey || ''}`;
      return s;
    }

    // Shot
    if (['2pt','3pt','dunk','pb','ft'].includes(type)) {
      s += fields.made ? '+' : '-';
      if (fields.shooter) s += `${fields.shooter.team}${fields.shooter.jersey}`;
      if (fields.assist) s += `+${fields.assist}`;
      if (fields.foulType && fields.fouler) s += `${fields.foulType}${fields.fouler.team}${fields.fouler.jersey}`;
      if (fields.block) s += `BL${fields.block.team}${fields.block.jersey}`;
      if (fields.location) s += ` @${fields.location}`;
      return s;
    }

    return s;
  }

  return { parse, generate, describe, wallClockToSecs, secsToWallClock, EVENT_TYPES, eventCategory, badgeClass, buildRaw, parseEvent };
})();
