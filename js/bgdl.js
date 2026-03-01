// BGDL format parser, generator, and description engine

const BGDL = (() => {

  // ── Court regions ───────────────────────────────────────────────────────────
  const REGIONS = {
    LC: 'Left Corner', LM: 'Left Mid', LP: 'Left Paint',
    LW: 'Left Wing', LE: 'Left Elbow',
    TC: 'Top Centre', TM: 'Top Mid', TP: 'Top Paint',
    RIM: 'Rim',
    RC: 'Right Corner', RM: 'Right Mid', RP: 'Right Paint',
    RW: 'Right Wing', RE: 'Right Elbow'
  };

  // ── Parse header from lines ─────────────────────────────────────────────────
  function parseHeader(lines) {
    const header = {
      game: '', date: '', video: '',
      teamA: { name: '', color: '' }, teamB: { name: '', color: '' },
      periods: { count: 4, duration: 10, overtime: 5 },
      runningClock: false
    };

    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const m = line.match(/^([A-Z]+)\s*:\s*(.*)$/i);
      if (!m) break; // first non-header line ends header section
      const tag = m[1].toUpperCase();
      const val = m[2].trim();
      switch (tag) {
        case 'GAME': header.game = val; break;
        case 'DATE': header.date = val; break;
        case 'VIDEO': header.video = val; break;
        case 'RUNNINGCLOCK': header.runningClock = /^(true|yes|1)$/i.test(val); break;
        case 'A': {
          const parts = val.split(',');
          header.teamA.name = parts[0].trim();
          header.teamA.color = (parts[1] || '').trim();
          break;
        }
        case 'B': {
          const parts = val.split(',');
          header.teamB.name = parts[0].trim();
          header.teamB.color = (parts[1] || '').trim();
          break;
        }
        case 'PERIODS': {
          // e.g. "4x10+5" or "2 X 20"
          const pm = val.replace(/\s/g, '').match(/^(\d+)[xX](\d+)(?:\+(\d+))?$/);
          if (pm) {
            header.periods.count    = parseInt(pm[1]);
            header.periods.duration = parseInt(pm[2]);
            header.periods.overtime = pm[3] ? parseInt(pm[3]) : 5;
          }
          break;
        }
      }
    }
    return header;
  }

  // ── Parse a single event detail record line ─────────────────────────────────
  // Returns { wallClock, gameClock, eventType, eventData } or null
  function parseDetailLine(line) {
    const clean = line.replace(/#.*$/, '').trim();
    if (!clean) return null;

    // Wall clock: optional hours, required mm:ss, optional .frac
    const wcRe = /^(\d{1,2}:\d{2}(?:\.\d+)?(?::\d{2}(?:\.\d+)?)?)/;
    const wcM = clean.match(wcRe);
    if (!wcM) return null;

    let rest = clean.slice(wcM[0].length).trimStart();
    const wallClock = wcM[0];

    // Optional game clock: P<n>T<mm:ss>
    let gameClock = null;
    const gcRe = /^(P\d+T\d{1,2}:\d{2}(?:\.\d+)?)\s*/i;
    const gcM = rest.match(gcRe);
    if (gcM) {
      gameClock = gcM[1];
      rest = rest.slice(gcM[0].length);
    }

    // Event type (first word)
    const etM = rest.match(/^(\S+)\s*(.*)?$/s);
    if (!etM) return null;
    const eventType = etM[1];
    const eventData = (etM[2] || '').trim();

    return { wallClock, gameClock, eventType, eventData, raw: clean };
  }

  // ── Parse a full BGDL file text ─────────────────────────────────────────────
  function parse(text) {
    const lines = text.split(/\r?\n/);
    const header = parseHeader(lines);
    const events = [];

    // Find where detail records start (first line not matching header tag pattern)
    let i = 0;
    for (; i < lines.length; i++) {
      const clean = lines[i].replace(/#.*$/, '').trim();
      if (!clean) continue;
      if (/^[A-Z]+\s*:/i.test(clean)) continue;
      break;
    }
    for (; i < lines.length; i++) {
      const rec = parseDetailLine(lines[i]);
      if (rec) events.push(rec);
    }

    return { header, events };
  }

  // ── Generate BGDL header text ───────────────────────────────────────────────
  function generateHeader(header) {
    const lines = [];
    if (header.game)  lines.push(`GAME: ${header.game}`);
    if (header.date)  lines.push(`DATE: ${header.date}`);
    if (header.video) lines.push(`VIDEO: ${header.video}`);
    const { count, duration, overtime } = header.periods;
    lines.push(`PERIODS: ${count}x${duration}+${overtime}`);
    const a = header.teamA;
    lines.push(`A: ${a.name}${a.color ? ',' + a.color : ''}`);
    const b = header.teamB;
    lines.push(`B: ${b.name}${b.color ? ',' + b.color : ''}`);
    if (header.runningClock) lines.push(`RUNNINGCLOCK: true`);
    return lines.join('\n');
  }

  // ── Format seconds as wall-clock string mm:ss.cc ────────────────────────────
  function formatWallClock(secs, decimals = 2) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    const ss = s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0');
    return `${String(m).padStart(2, '0')}:${ss}`;
  }

  // ── Format game clock as P<n>T<mm:ss> ──────────────────────────────────────
  function formatGameClock(period, secsRemaining) {
    return `P${period}T${formatWallClock(secsRemaining, 0)}`;
  }

  // ── Parse wall clock string to seconds ─────────────────────────────────────
  function parseWallClock(str) {
    // handles h:mm:ss.f or mm:ss.f or m:ss
    const parts = str.split(':');
    let secs = 0;
    if (parts.length === 3) {
      secs = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      secs = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return secs;
  }

  // ── Parse game clock string to { period, secsRemaining } ───────────────────
  function parseGameClock(str) {
    const m = str.match(/P(\d+)T(\d{1,2}:\d{2}(?:\.\d+)?)/i);
    if (!m) return null;
    return { period: parseInt(m[1]), secsRemaining: parseWallClock(m[2]) };
  }

  // ── Helper: player label from data token ───────────────────────────────────
  // e.g. "A5" → "Team A #5", "b27" → "Team B #27"
  function playerLabel(token, teamA, teamB) {
    const m = token.match(/^([AB])(\d+)$/i);
    if (!m) return token;
    const team = m[1].toUpperCase() === 'A' ? (teamA || 'Team A') : (teamB || 'Team B');
    return `${team} #${m[2]}`;
  }

  function teamLabel(letter, teamA, teamB) {
    return letter.toUpperCase() === 'A' ? (teamA || 'Team A') : (teamB || 'Team B');
  }

  // ── Generate human-readable description for an event ───────────────────────
  function describe(eventType, eventData, teamAName, teamBName) {
    const et = eventType.toLowerCase();
    const tA = teamAName || 'Team A';
    const tB = teamBName || 'Team B';

    const pl = (tok) => playerLabel(tok, tA, tB);
    const tm = (letter) => teamLabel(letter, tA, tB);

    // ── Clock events ──
    if (et === 'start') return 'Game Clock Started';
    if (et === 'stop')  return 'Game Clock Stopped';
    if (et === 'sync')  return 'Clock Sync';

    // ── Lineups ──
    if (et === 'la') return `${tA} Lineup: ${eventData}`;
    if (et === 'lb') return `${tB} Lineup: ${eventData}`;

    // ── Violations ──
    const violations = {
      travel: 'Travelling', out: 'Out of Bounds', back: 'Backcourt Violation',
      double: 'Double Dribble', shotclock: 'Shot Clock Violation',
      '3s': '3-Second Violation', '5s': '5-Second Violation', '8s': '8-Second Violation'
    };
    if (violations[et]) {
      const who = eventData ? pl(eventData) : '';
      return `${violations[et]}${who ? ' — ' + who : ''}`;
    }

    // ── Non-shooting fouls ──
    const fouls = {
      df: 'Defensive Foul', of: 'Offensive Foul',
      tf: 'Technical Foul', uf: 'Unsportsmanlike Foul', dq: 'Disqualifying Foul'
    };
    if (fouls[et]) {
      const who = eventData ? pl(eventData) : '';
      return `${fouls[et]}${who ? ' — ' + who : ''}`;
    }

    // ── Rebounds ──
    if (et === 'rebound') {
      const who = eventData ? pl(eventData) : '';
      return `Rebound${who ? ' — ' + who : ''}`;
    }

    // ── Turnovers / steals / deflections ──
    if (et === 'to') {
      let desc = `Turnover — ${pl(eventData)}`;
      // check for embedded STL
      const stlM = eventData.match(/STL\s*([AB]\d+)/i);
      if (stlM) {
        const victim = eventData.split(/\s+STL/i)[0].trim();
        desc = `Turnover — ${pl(victim)}; Steal — ${pl(stlM[1])}`;
      }
      return desc;
    }
    if (et === 'stl') return `Steal — ${pl(eventData)}`;
    if (et === 'def') return `Deflection — ${pl(eventData)}`;

    // ── Score override ──
    if (et === 'score') return `Score Override: ${eventData}`;

    // ── Shot attempts ──
    const shotNames = {
      '2pt': '2 Point', '3pt': '3 Point', dunk: 'Dunk', pb: 'Put Back', ft: 'Free Throw'
    };
    if (shotNames[et]) {
      return describeShot(shotNames[et], eventData, tA, tB);
    }

    return `${eventType} ${eventData}`.trim();
  }

  function describeShot(shotName, data, tA, tB) {
    // Pattern: [+|-] <player> [+<assist>] [SF|UF|DQ <defender>] [BL <defender>] [@<region>]
    // e.g. "+A15+8SFB19 @rim"  or "-A5 BL B1"
    const pl = (tok) => playerLabel(tok, tA, tB);

    let rest = data.trim();
    let made = null;

    const hitM = rest.match(/^([+\-])/);
    if (hitM) { made = hitM[1] === '+'; rest = rest.slice(1).trimStart(); }

    // shooter: A or B followed by digits
    const shooterM = rest.match(/^([AB]\d+)/i);
    let shooter = '';
    if (shooterM) { shooter = shooterM[1]; rest = rest.slice(shooterM[0].length).trimStart(); }

    // assist: +<number>
    let assist = '';
    const assistM = rest.match(/^\+(\d+)/);
    if (assistM) { assist = assistM[1]; rest = rest.slice(assistM[0].length).trimStart(); }

    // foul modifier: SF|UF|DQ <player>
    let foulType = '', fouler = '';
    const foulM = rest.match(/^(SF|UF|DQ)\s*([AB]\d+)/i);
    if (foulM) { foulType = foulM[1].toUpperCase(); fouler = foulM[2]; rest = rest.slice(foulM[0].length).trimStart(); }

    // block: BL <player>
    let blocker = '';
    const blM = rest.match(/^BL\s*([AB]\d+)/i);
    if (blM) { blocker = blM[1]; rest = rest.slice(blM[0].length).trimStart(); }

    // region: @<code>
    let region = '';
    const regM = rest.match(/@([A-Z]+)/i);
    if (regM) { region = REGIONS[regM[1].toUpperCase()] || regM[1]; }

    let parts = [shotName];
    if (made !== null) parts.push(made ? 'Made' : 'Missed');
    if (shooter) parts.push(`— ${pl(shooter)}`);
    if (assist)  parts.push(`(Assisted by #${assist})`);
    if (foulType) {
      const foulNames = { SF: 'Shooting Foul', UF: 'Unsportsmanlike Foul', DQ: 'Disqualifying Foul' };
      parts.push(`${foulNames[foulType] || foulType} on ${pl(fouler)}`);
    }
    if (blocker) parts.push(`Blocked by ${pl(blocker)}`);
    if (region)  parts.push(`@ ${region}`);

    return parts.join(' ');
  }

  // ── Compute game clock from events ─────────────────────────────────────────
  // Returns the game clock state { period, secsRemaining } at a given wall clock position
  function computeGameClock(events, wallClockSecs, header) {
    const periodDuration = (header.periods.duration || 10) * 60;
    const overtimeDuration = (header.periods.overtime || 5) * 60;
    const numPeriods = header.periods.count || 4;

    let period = 1;
    let secsRemaining = periodDuration;
    let clockRunning = false;
    let lastWall = null; // wall clock (secs) of last event
    let lastSecsRemaining = secsRemaining;
    let lastPeriod = period;

    for (const ev of events) {
      const evWall = parseWallClock(ev.wallClock);
      if (evWall > wallClockSecs) break;

      // If clock is running, advance it
      if (clockRunning && lastWall !== null) {
        const elapsed = evWall - lastWall;
        secsRemaining -= elapsed;
        if (secsRemaining < 0) secsRemaining = 0;
      }

      // If this event has an explicit game clock, use it (authoritative sync)
      if (ev.gameClock) {
        const gc = parseGameClock(ev.gameClock);
        if (gc) { period = gc.period; secsRemaining = gc.secsRemaining; }
      }

      const et = ev.eventType.toLowerCase();
      if (et === 'start') clockRunning = true;
      if (et === 'stop' || et === 'sync') clockRunning = false;

      lastWall = evWall;
      lastSecsRemaining = secsRemaining;
      lastPeriod = period;
    }

    // Continue advancing if clock still running up to query time
    if (clockRunning && lastWall !== null) {
      const elapsed = wallClockSecs - lastWall;
      secsRemaining = Math.max(0, secsRemaining - elapsed);
    }

    return { period, secsRemaining };
  }

  // ── Compute game score from events ─────────────────────────────────────────
  // Returns { scoreA, scoreB } at a given wall clock position.
  // 'score' events set both scores absolutely; shot events increment by points.
  function computeScore(events, wallClockSecs) {
    let scoreA = 0;
    let scoreB = 0;

    for (const ev of events) {
      const evWall = parseWallClock(ev.wallClock);
      if (evWall > wallClockSecs) break;

      const et = ev.eventType.toLowerCase();

      // Score override: eventData like "18 - 10" or "18-10"
      if (et === 'score') {
        const m = ev.eventData.replace(/\s/g, '').match(/^(\d+)-(\d+)$/);
        if (m) { scoreA = parseInt(m[1]); scoreB = parseInt(m[2]); }
        continue;
      }

      // Successful shot attempts
      const shotPoints = { ft: 1, '2pt': 2, pb: 2, dunk: 2, '3pt': 3 };
      const pts = shotPoints[et];
      if (pts === undefined) continue;

      // Success indicator: eventData must start with '+'
      const data = ev.eventData.trim();
      if (!data.startsWith('+')) continue;

      // Team: first non-space char after the '+' is A or B
      const teamM = data.slice(1).trimStart().match(/^([AB])/i);
      if (!teamM) continue;

      if (teamM[1].toUpperCase() === 'A') scoreA += pts;
      else scoreB += pts;
    }

    return { scoreA, scoreB };
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  return {
    parse,
    parseHeader,
    parseDetailLine,
    parseWallClock,
    parseGameClock,
    formatWallClock,
    formatGameClock,
    generateHeader,
    describe,
    computeGameClock,
    computeScore,
    REGIONS
  };
})();
