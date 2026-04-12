#!/usr/bin/env python3
"""Verify a BGDL file for conformance to the BGDL specification.

Usage:
    python verify_bgdl.py game.bgdl
    python verify_bgdl.py *.bgdl --quiet
    python verify_bgdl.py game.bgdl --strict
"""
import argparse
import re
import sys

# --- Constants ---

HEADER_TAGS = {'GAME', 'GAME_ID', 'PERIODS', 'DATE', 'VIDEO', 'A', 'B', 'VENUE', 'GAME_WEBPAGE', 'LOCATION_FORMAT'}
LOCATION_FORMATS = {'FULL_COURT', 'HALF_COURT', 'NONE'}

NAMED_REGIONS = {'LC', 'LW', 'TC', 'RW', 'RC', 'LM', 'LE', 'TM', 'RE', 'RM', 'LP', 'TP', 'RP', 'RIM', 'BC'}

SHOT_TYPES = {'2pt', '3pt', 'dunk', 'pb', 'ft'}
SHOT_MODIFIERS = {'SF', 'UF', 'DQ', 'BL'}
FOUL_TYPES = {'df', 'of', 'tf', 'uf', 'dq'}
VIOLATION_TYPES = {'travel', 'out', 'back', 'double', 'shotclock', '3s', '5s', '8s'}
CLOCK_EVENTS = {'start', 'stop', 'sync', 'timeout'}
OTHER_EVENTS = {'rebound', 'to', 'stl', 'def', 'jumpball', 'score', 'ast', 'blk'}
LINEUP_EVENTS = {'la', 'lb'}

ALL_EVENT_TYPES = SHOT_TYPES | FOUL_TYPES | VIOLATION_TYPES | CLOCK_EVENTS | OTHER_EVENTS | LINEUP_EVENTS

# Regex patterns
WALL_CLOCK_RE = re.compile(r'^(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)$')
WALL_CLOCK_PLACEHOLDER = '-'
GAME_CLOCK_RE = re.compile(r'^P(\d+)T(\d{1,2}:\d{2}(?:\.\d+)?)$')
PLAYER_REF_RE = re.compile(r'^[ABab]\d+$')
TEAM_REF_RE = re.compile(r'^[ABab]$')
PLAYER_OR_TEAM_RE = re.compile(r'^[ABab]\d*$')
COORD_RE = re.compile(r'@\((\d+),(\d+)\)')
REGION_RE = re.compile(r'@([A-Z]{2,3})\b')
PERIODS_RE = re.compile(r'^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))?$')
ROSTER_RE = re.compile(r'^R([AB])(\d+)\s+(.*?)(?:\s*,\s*(.+))?$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}')
SCORE_RE = re.compile(r'^\d+\s*-\s*\d+$')


class Issue:
    def __init__(self, line_num, level, message):
        self.line_num = line_num
        self.level = level  # 'error' or 'warning'
        self.message = message

    def __str__(self):
        return f"  Line {self.line_num}: [{self.level.upper()}] {self.message}"


def verify_bgdl(filepath, strict=False):
    """Verify a BGDL file. Returns list of Issue objects."""
    with open(filepath) as f:
        lines = f.readlines()

    issues = []
    header = {}
    roster_a = {}  # number -> name
    roster_b = {}
    in_header = True
    events = []
    team_a_code = None
    team_b_code = None
    last_wall_clock_secs = None
    periods_per_game = 4
    min_per_period = 10
    min_per_ot = 5

    def warn(line_num, msg):
        issues.append(Issue(line_num, 'warning', msg))

    def error(line_num, msg):
        issues.append(Issue(line_num, 'error', msg))

    def parse_wall_clock_secs(wc_str):
        parts = wc_str.split(':')
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        elif len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        return None

    for line_num, raw_line in enumerate(lines, 1):
        line = raw_line.rstrip('\n')

        # Strip comments (but preserve roster comments for analysis)
        comment_part = ''
        code_part = line
        if '#' in line:
            idx = line.index('#')
            code_part = line[:idx]
            comment_part = line[idx+1:]
        code_part = code_part.strip()

        if not code_part:
            continue

        # --- Header parsing ---
        if in_header:
            # Roster line
            rm = ROSTER_RE.match(code_part)
            if rm:
                team_letter, number, name_part = rm.group(1), rm.group(2), rm.group(3)
                name = name_part.split(',')[0].strip() if ',' in name_part else name_part.strip()
                if team_letter == 'A':
                    if number in roster_a:
                        warn(line_num, f"Duplicate roster entry for A#{number}")
                    roster_a[number] = name
                else:
                    if number in roster_b:
                        warn(line_num, f"Duplicate roster entry for B#{number}")
                    roster_b[number] = name
                continue

            # Header tag
            hm = re.match(r'^([A-Z_]+)\s*:\s*(.+)$', code_part)
            if hm:
                tag, value = hm.group(1), hm.group(2).strip()
                if tag not in HEADER_TAGS:
                    warn(line_num, f"Unknown header tag: {tag}")
                if tag in header:
                    warn(line_num, f"Duplicate header tag: {tag}")
                header[tag] = value

                # Validate specific tags
                if tag == 'PERIODS':
                    pm = PERIODS_RE.match(value)
                    if not pm:
                        error(line_num, f"Invalid PERIODS format: '{value}' (expected NxM or NxM+O)")
                    else:
                        periods_per_game = int(float(pm.group(1)))
                        min_per_period = int(float(pm.group(2)))
                        if pm.group(3):
                            min_per_ot = int(float(pm.group(3)))

                if tag == 'DATE' and not DATE_RE.match(value):
                    error(line_num, f"Invalid DATE format: '{value}' (expected ISO 8601)")

                if tag == 'LOCATION_FORMAT' and value not in LOCATION_FORMATS:
                    error(line_num, f"Invalid LOCATION_FORMAT: '{value}' (expected {LOCATION_FORMATS})")

                if tag == 'A':
                    if '/' in value:
                        team_a_code = value.split('/')[0].strip()
                    else:
                        team_a_code = value.split(',')[0].strip()

                if tag == 'B':
                    if '/' in value:
                        team_b_code = value.split('/')[0].strip()
                    else:
                        team_b_code = value.split(',')[0].strip()

                continue

            # Not a header line — transition to events
            in_header = False

        # --- Event parsing ---
        # Event format: wall_clock [game_clock] event_type event_data
        # Wall clock can be - placeholder
        parts = code_part.split(None, 1)
        if len(parts) < 2:
            error(line_num, f"Malformed event line: '{code_part}'")
            continue

        wc_str = parts[0]
        remainder = parts[1]

        # Validate wall clock
        if wc_str != WALL_CLOCK_PLACEHOLDER:
            if not WALL_CLOCK_RE.match(wc_str):
                error(line_num, f"Invalid wall clock: '{wc_str}'")
            else:
                wc_secs = parse_wall_clock_secs(wc_str)
                if wc_secs is not None and last_wall_clock_secs is not None:
                    if wc_secs < last_wall_clock_secs - 1:
                        warn(line_num, f"Wall clock goes backwards: {wc_str} (previous was larger)")
                if wc_secs is not None:
                    last_wall_clock_secs = wc_secs

        # Check for game clock
        gc_str = None
        tokens = remainder.split(None, 1)
        if tokens and GAME_CLOCK_RE.match(tokens[0]):
            gc_str = tokens[0]
            gc_match = GAME_CLOCK_RE.match(gc_str)
            period = int(gc_match.group(1))
            gc_time = gc_match.group(2)
            # Validate period number
            if period < 1:
                error(line_num, f"Invalid period number: {period}")
            # Validate time within period
            gc_parts = gc_time.split(':')
            gc_mins = int(gc_parts[0])
            expected_mins = min_per_period if period <= periods_per_game else min_per_ot
            if gc_mins > expected_mins:
                warn(line_num, f"Game clock {gc_str}: {gc_mins} minutes exceeds period length {expected_mins}")

            remainder = tokens[1] if len(tokens) > 1 else ''
        elif wc_str == WALL_CLOCK_PLACEHOLDER and strict:
            warn(line_num, "No game clock provided with '-' wall clock placeholder")

        if not remainder.strip():
            if comment_part.strip():
                warn(line_num, f"Event content appears to be in a comment: '#{comment_part.strip()}'")
            else:
                error(line_num, "Event line has no event after time tag")
            continue

        # Parse event type
        event_parts = remainder.strip().split(None, 1)
        event_token = event_parts[0].lower()
        event_data = event_parts[1] if len(event_parts) > 1 else ''

        # Determine event type
        # Shot attempts: start with shot type followed by +/- and optional player ref (all one token)
        shot_match = re.match(r'^(2pt|3pt|dunk|pb|ft)([+-])([ABab]\d*)?(.*)$', remainder.strip(), re.IGNORECASE)
        if shot_match:
            shot_type = shot_match.group(1).lower()
            success = shot_match.group(2)
            player_ref_str = shot_match.group(3) or ''
            shot_rest = shot_match.group(4) or ''

            # Free throws: player ref is optional (ft+ or ft+A or ft+A5)
            if shot_type == 'ft':
                pass  # all forms acceptable
            else:
                # Non-FT shots: should have at least a team ref
                if not player_ref_str:
                    if strict:
                        warn(line_num, f"Shot attempt has no player reference after {shot_type}{success}")
                else:
                    team = player_ref_str[0].upper()
                    number = player_ref_str[1:]
                    if number:
                        roster = roster_a if team == 'A' else roster_b
                        if roster and number not in roster:
                            warn(line_num, f"Player {player_ref_str} not in roster")

            # Check for valid modifiers (assist +N, shooting foul SF, block BL)
            for mod_match in re.finditer(r'(SF|UF|DQ|BL)([ABab]\d+)', shot_rest):
                mod_type = mod_match.group(1)
                if mod_type == 'BL' and success == '+':
                    error(line_num, f"Block modifier on successful shot (blocks only apply to misses)")

            events.append({'line': line_num, 'type': 'shot', 'shot_type': shot_type, 'success': success})
            continue

        # Lineup events
        if event_token in LINEUP_EVENTS:
            numbers = re.findall(r'\d+', event_data)
            if len(numbers) != 5 and strict:
                warn(line_num, f"Lineup has {len(numbers)} players (expected 5)")
            events.append({'line': line_num, 'type': 'lineup'})
            continue

        # Score override
        if event_token == 'score':
            if not SCORE_RE.match(event_data.strip()):
                error(line_num, f"Invalid score format: '{event_data}' (expected 'N - N')")
            events.append({'line': line_num, 'type': 'score'})
            continue

        # Clock events
        if event_token in CLOCK_EVENTS:
            if event_token == 'timeout' and event_data.strip():
                if not TEAM_REF_RE.match(event_data.strip().split()[0]):
                    warn(line_num, f"Timeout team reference unclear: '{event_data}'")
            events.append({'line': line_num, 'type': 'clock'})
            continue

        # Foul events
        if event_token in FOUL_TYPES:
            if not event_data.strip():
                error(line_num, f"Foul event missing player/team reference")
            else:
                ref = event_data.strip().split()[0]
                if not PLAYER_OR_TEAM_RE.match(ref):
                    # Allow bench/coach fouls: AB, BB, AC, BC
                    if ref.upper() not in ('AB', 'BB', 'AC', 'BC'):
                        error(line_num, f"Invalid foul reference: '{ref}'")
            events.append({'line': line_num, 'type': 'foul'})
            continue

        # Violations
        if event_token in VIOLATION_TYPES:
            if not event_data.strip():
                if strict:
                    warn(line_num, f"Violation event missing player/team reference")
            events.append({'line': line_num, 'type': 'violation'})
            continue

        # Rebounds
        if event_token == 'rebound':
            if not event_data.strip():
                if strict:
                    warn(line_num, "Rebound missing player/team reference")
            events.append({'line': line_num, 'type': 'rebound'})
            continue

        # Turnovers (may include inline steal)
        if event_token == 'to':
            events.append({'line': line_num, 'type': 'turnover'})
            continue

        # Standalone steal
        if event_token == 'stl':
            events.append({'line': line_num, 'type': 'steal'})
            continue

        # Standalone assist (hand-tagged format)
        if event_token == 'ast':
            events.append({'line': line_num, 'type': 'assist'})
            continue

        # Standalone block (hand-tagged format)
        if event_token == 'blk':
            events.append({'line': line_num, 'type': 'block'})
            continue

        # Deflection
        if event_token == 'def':
            events.append({'line': line_num, 'type': 'deflection'})
            continue

        # Jump ball
        if event_token == 'jumpball':
            events.append({'line': line_num, 'type': 'jumpball'})
            continue

        # Unknown event
        error(line_num, f"Unknown event type: '{event_token}'")

    # --- Post-parse validation ---

    # Required headers
    if 'A' not in header:
        error(0, "Missing required header tag: A (Team A)")
    if 'B' not in header:
        error(0, "Missing required header tag: B (Team B)")
    if 'PERIODS' not in header:
        warn(0, "Missing header tag: PERIODS")

    # Recommended headers
    if strict:
        for tag in ('GAME', 'GAME_ID', 'DATE'):
            if tag not in header:
                warn(0, f"Missing recommended header tag: {tag}")

    # Check rosters have entries if any roster lines exist
    if roster_a and len(roster_a) < 5 and strict:
        warn(0, f"Team A roster has only {len(roster_a)} players (expected at least 5)")
    if roster_b and len(roster_b) < 5 and strict:
        warn(0, f"Team B roster has only {len(roster_b)} players (expected at least 5)")

    # Check free throw sequences (ft should follow a shooting foul)
    for i, evt in enumerate(events):
        if evt['type'] == 'shot' and evt.get('shot_type') == 'ft':
            # Look back for a shooting foul or another ft
            if i > 0 and events[i-1]['type'] not in ('shot', 'foul'):
                if strict:
                    warn(evt['line'], "Free throw not preceded by a shooting foul or another free throw")

    return issues


def main():
    parser = argparse.ArgumentParser(description='Verify BGDL files for spec conformance')
    parser.add_argument('files', nargs='+', help='BGDL file(s) to verify')
    parser.add_argument('--strict', action='store_true', help='Enable strict mode (more warnings)')
    parser.add_argument('--quiet', action='store_true', help='Only show files with errors')
    args = parser.parse_args()

    total_errors = 0
    total_warnings = 0

    for filepath in args.files:
        try:
            issues = verify_bgdl(filepath, strict=args.strict)
        except Exception as e:
            print(f"{filepath}: FAILED TO PARSE - {e}")
            total_errors += 1
            continue

        errors = [i for i in issues if i.level == 'error']
        warnings = [i for i in issues if i.level == 'warning']
        total_errors += len(errors)
        total_warnings += len(warnings)

        if args.quiet and not errors:
            continue

        if not issues:
            print(f"{filepath}: OK")
        else:
            status = "ERRORS" if errors else "WARNINGS"
            print(f"{filepath}: {status} ({len(errors)} errors, {len(warnings)} warnings)")
            for issue in issues:
                print(issue)

    if len(args.files) > 1:
        print(f"\nTotal: {total_errors} errors, {total_warnings} warnings across {len(args.files)} files")

    sys.exit(1 if total_errors > 0 else 0)


if __name__ == '__main__':
    main()
