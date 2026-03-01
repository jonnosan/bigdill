/**
 * score.js — Score and game-clock calculation engine.
 *
 * Score.calculate(events, wallSecs, periodsStr)
 *   → { scoreA, scoreB, period, gameClockSecs, clockRunning }
 *
 * Accumulates score from all successful shots up to wallSecs.
 * Interpolates game clock from start/stop/sync events.
 */
const Score = (() => {

  const SHOT_PTS = { ft: 1, '3pt': 3, '2pt': 2, dunk: 2, pb: 2 };

  // Parse "4x10+5" → { periodDuration: 600, numPeriods: 4, overtimeDuration: 300 }
  function parsePeriods(str) {
    if (!str) return { periodDuration: 600, numPeriods: 4, overtimeDuration: 300 };
    const m = str.trim().match(/^(\d+)\s*[xX]\s*(\d+)(?:\+(\d+))?$/);
    if (!m) return { periodDuration: 600, numPeriods: 4, overtimeDuration: 300 };
    return {
      numPeriods: parseInt(m[1]),
      periodDuration: parseInt(m[2]) * 60,
      overtimeDuration: m[3] ? parseInt(m[3]) * 60 : 300,
    };
  }

  function calculate(events, wallSecs, periodsStr) {
    const result = { scoreA: 0, scoreB: 0, period: 1, gameClockSecs: null, clockRunning: false };
    if (!events || events.length === 0) return result;

    // Work through events up to wallSecs
    const relevant = events.filter(e => e.wallSecs != null && e.wallSecs <= wallSecs);

    // Last known game-clock anchor: { wallSecs, gameClockSecs, period, running }
    let anchor = null;

    for (const ev of relevant) {
      const type = (ev.type || '').toLowerCase();

      // Score accumulation
      if (SHOT_PTS[type] !== undefined && ev.made) {
        if (ev.shooter) {
          if (ev.shooter.team === 'A') result.scoreA += SHOT_PTS[type];
          else result.scoreB += SHOT_PTS[type];
        }
      }

      // Score override
      if (type === 'score') {
        if (ev.scoreA != null) result.scoreA = ev.scoreA;
        if (ev.scoreB != null) result.scoreB = ev.scoreB;
      }

      // Clock anchors
      if (ev.gameClock) {
        anchor = {
          wallSecs: ev.wallSecs,
          gameClockSecs: ev.gameClock.secs,
          period: ev.gameClock.period,
          running: (type === 'start' || type === 'sync'),
        };
      } else if (type === 'start' && anchor) {
        anchor = { ...anchor, wallSecs: ev.wallSecs, running: true };
      } else if (type === 'stop' && anchor) {
        // Freeze clock — compute current value first
        const elapsed = ev.wallSecs - anchor.wallSecs;
        const frozenSecs = anchor.running ? Math.max(0, anchor.gameClockSecs - elapsed) : anchor.gameClockSecs;
        anchor = { ...anchor, wallSecs: ev.wallSecs, gameClockSecs: frozenSecs, running: false };
      } else if (type === 'sync' && anchor) {
        // sync without gameClock tag — treat as start
        anchor = { ...anchor, wallSecs: ev.wallSecs, running: true };
      }
    }

    // Compute game clock at wallSecs
    if (anchor) {
      result.period = anchor.period;
      if (anchor.running) {
        const elapsed = wallSecs - anchor.wallSecs;
        result.gameClockSecs = Math.max(0, anchor.gameClockSecs - elapsed);
        result.clockRunning = true;
      } else {
        result.gameClockSecs = anchor.gameClockSecs;
        result.clockRunning = false;
      }
    }

    return result;
  }

  function formatClock(period, secs, numPeriods) {
    let label;
    if (numPeriods && period > numPeriods) {
      const ot = period - numPeriods;
      label = ot === 1 ? 'OT' : `OT${ot}`;
    } else {
      label = `P${period}`;
    }
    if (secs == null) return `${label} --:--`;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${label} ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return { calculate, parsePeriods, formatClock };
})();
