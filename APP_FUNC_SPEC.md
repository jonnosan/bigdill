# BigDill App — Functional Specification

## 1. Purpose

BigDill is a web application for recording basketball game statistics in the BGDL format. A statistician uses it to annotate a game — live or from video — producing a `.bgdl` file that can later be processed into play-by-plays, box scores, and video clip indexes.

---

## 2. High-Level User Flow

1. Open the app → land on the **Game List** screen.
2. Create a new game or open an existing `.bgdl` file → enter the **Game Setup** screen.
3. Save setup → enter the **Game Events** screen.
4. On the Game Events screen, the statistician watches video and records events, navigates the timeline, and monitors the running score and game clock.
5. At any time, save the `.bgdl` file (server-side storage and/or browser download).

---

## 3. Screens

### 3.1 Game List Screen

- Lists all game records stored on the server.
- Each row shows: game name, date, teams, and number of events recorded.
- Actions per row: **Open**, **Delete**, **Export** (download as `.bgdl`).
- Button: **New Game** → navigates to Game Setup for a blank game.
- Button: **Import** → upload a `.bgdl` file from disk; opens it in Game Setup.

---

### 3.2 Game Setup Screen

Allows the user to configure the game metadata (the BGDL header).

#### Fields

| Field | BGDL Tag | Input type | Notes |
|---|---|---|---|
| Game name / description | `GAME` | Text | Free-form label |
| Game ID | `GAME_ID` | Text | Optional machine-readable unique identifier (e.g. `YLM1::776812`) |
| Date | `DATE` | Date/time picker | Stored as ISO 8601 |
| Periods | `PERIODS` | Text | e.g. `4x10+5` — validated against BGDL format |
| Video URL | `VIDEO` | URL text field | YouTube, direct MP4, HLS, DASH |
| Team A name | `A` | Text | Optionally `name,colour` |
| Team B name | `B` | Text | Optionally `name,colour` |
| Running Clock? | *(app-only)* | Checkbox | Default: unchecked. See §4.3. |

- All fields are optional except Game name (required for identification).
- A **Preview Video** button tests the video URL in a small inline player before committing.
- **Save & Start** button saves metadata and navigates to the Game Events screen.
- **Cancel** returns to Game List without saving.

#### Rosters

Below the main fields, the Setup screen has a **Roster** section for each team (Team A and Team B). Each roster section is collapsed by default and can be expanded independently.

A roster is a list of players, where each player has:
- **Jersey number** (required) — the number worn in this game
- **Name** (optional) — player's display name
- **Player ID** (optional) — machine-readable identifier for cross-game tracking (e.g. a league registration number)

Players can be added one at a time via an **Add Player** button (opens a small inline form with the three fields above), edited in place, or removed. The roster can also be pasted in as a block of text (one player per line, comma-separated: `jersey,name,playerid`) via a **Paste Roster** button that opens a textarea.

Rosters are stored in the app's game metadata. They do not map to BGDL header tags but are preserved in the app's server-side game record alongside the `.bgdl` file.

**Effect on event entry — see §4.4.**

---

### 3.3 Game Events Screen

This is the primary working screen. It has four main zones:

```
┌─────────────────────────────────────────────────────┐
│  SCOREBOARD BAR                                     │
│  Team A  18        P2  07:43        Team B  12      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  VIDEO PLAYER                                       │
│                                                     │
├─────────────────────────────────────────────────────┤
│  VIDEO CONTROLS  (play/pause, ±5s, ±30s, speed)    │
│  SEEKBAR (wall-clock timeline with event markers)   │
├─────────────────────────────────────────────────────┤
│  EVENT PANEL                                        │
└─────────────────────────────────────────────────────┘
```

#### 3.3.1 Scoreboard Bar

Displayed persistently at the top of the screen. Shows:

- **Team A name** and **Team A score**
- **Period** and **Game clock time remaining** (e.g. `P2  07:43`)
- **Team B name** and **Team B score**

The scoreboard reflects the game state **at the current video playback position**, not the final score. As the user scrubs or plays the video, the scoreboard updates in real time by recalculating the score and clock from the BGDL event records up to the current wall-clock position.

When the current video position falls before any recorded events, the scoreboard shows `0 – 0` and the clock shows the start of Period 1.

#### 3.3.2 Video Player

- Embeds the video specified by the `VIDEO` header tag.
- Supports YouTube URLs, direct MP4/HLS/DASH URLs.
- Plays, pauses, and seeks in response to user interaction and keyboard shortcuts.

#### 3.3.3 Video Controls and Seekbar

Controls:
- Play / Pause
- Step back 5 s / 30 s
- Step forward 5 s / 30 s
- Playback speed selector (0.25×, 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2×)

Seekbar:
- A horizontal timeline representing the full video duration.
- Event markers are drawn on the seekbar at the wall-clock position of each recorded BGDL event, colour-coded by event category (shot, foul, turnover, clock, etc.).
- Clicking or dragging the seekbar seeks the video and updates the scoreboard.
- Hovering over a marker shows a tooltip with the human-readable description of that event.

#### 3.3.4 Event Panel

The event panel occupies the lower section of the screen and has two sub-modes selected by a toggle:

**a) Event List sub-mode (default)**

- A scrollable table of all recorded BGDL events, one row per event.
- Columns: Wall Clock | Game Clock | Event Type | Description | Actions
- The row corresponding to the current video position is highlighted.
- Scrolls automatically to keep the current-position row visible during playback.
- Each row has **Edit** and **Delete** action buttons.
- An **Add Event** button opens the Event Entry form at the current video time.

**b) BGDL Text sub-mode**

- A plain-text editor showing the raw BGDL content of the entire file (header + events).
- The user can edit BGDL directly; the app parses and validates on save.
- Syntax errors are highlighted inline, with a human-readable error message.
- A **Apply** button parses the text and updates the in-memory game state (scoreboard, seekbar markers, event list).

---

## 4. Event Entry

When the user adds or edits an event, they are presented with the **Event Entry form**. This form has two entry modes, switchable by a toggle within the form:

### 4.1 GUI Entry Mode

A structured form tailored to the event type being recorded.

**Quick Clock Buttons**

Two prominent buttons — **START** and **STOP** — appear at the top of the Event Entry form (and also persistently in the Game Events screen header area). Pressing either immediately records a `start` or `stop` clock event at the current video wall-clock position, with no further fields required. These bypass the step-by-step flow below.

**Step 1 — Event Type selection**

The user picks from a categorised list of event types:

- Clock events: Sync (Start and Stop are handled by the quick buttons above)
- Shot attempts: 2pt, 3pt, Dunk, Put Back, Free Throw
- Fouls: Defensive, Offensive, Technical, Unsportsmanlike, Disqualifying
- Violations: Travel, Out of Bounds, Backcourt, Double Dribble, Shot Clock, 3-second, 5-second, 8-second
- Rebounds
- Turnovers / Steals / Deflections
- Lineups: Team A, Team B
- Score Override

**Step 2 — Event Data fields**

The form shows only the fields relevant to the selected event type. Examples:

- *Shot attempt*: Team selector → Player selector → Make/Miss toggle → Assist player (optional) → Shot location (optional region picker using the court diagram) → Foul/Block modifier (optional, with fouling player field)
- *Foul*: Team → Player selector (or Bench/Coach for tech fouls)
- *Lineup*: Player selectors for up to 5 players for the chosen team (see §4.4)
- *Violation*: Team selector → Player selector (optional)
- *Score Override*: Team A score field, Team B score field

Where a **player selector** appears and a roster exists for that team, it is a searchable dropdown listing roster players by jersey number and name. Where no roster exists for a team, the player selector is a free-text jersey number field. See §4.4.

**Step 3 — Time**

- Wall clock is pre-filled from the current video position (editable).
- Game clock field is optional; the user may enter it manually (format `P<n>T<mm:ss>`) or leave it blank to be inferred from prior events.

**Confirm / Cancel** buttons at the bottom of the form.

### 4.2 Direct BGDL Entry Mode

- A single text input field pre-filled with the wall clock at the current video position.
- The user types the remainder of the BGDL event detail record (e.g. `P1T8:15 2pt+A15+8SFB19 @rim`).
- The field validates the entry in real time and shows a human-readable interpretation below the field (e.g. *"2-point make by Team A #15, assisted by #8; shooting foul on Team B #19"*).
- If validation fails, the error is shown inline and the Confirm button is disabled.

### 4.3 Running Clock Auto-Stop

When **Running Clock?** is unchecked (the default — applicable to FIBA and most basketball formats where the clock stops on every whistle):

- Recording a **Foul** or **Violation** event automatically inserts a `stop` clock event at the same wall-clock position, immediately before the foul/violation record in the event list.
- This `stop` is inserted silently; the user is not prompted.
- If the clock is already stopped at that wall-clock position (i.e. the most recent clock event before this position is already a `stop`), no duplicate `stop` is inserted.

When **Running Clock?** is checked (e.g. running-clock recreational games), no automatic `stop` is inserted.

This setting is stored in the app's game metadata but does not map to a BGDL header tag — it is inferred from context when importing a BGDL file and defaults to unchecked.

### 4.4 Roster-Driven Player Selection

The presence or absence of a roster for a team determines how players are entered throughout the Event Entry form:

| Roster defined for team? | Player input method |
|---|---|
| Yes | Searchable dropdown; only roster players are selectable |
| No | Free-text jersey number field |

This applies consistently to all player fields: shooter, assister, fouler, blocker, steal, rebound, violation player, and lineup slots.

**Lineup entry with a roster:**
- The user is presented with up to 5 player selectors, each a searchable dropdown of the team's roster.
- The same player cannot be selected more than once in the same lineup.
- Fewer than 5 players may be selected (triggers a warning per §8, but is not an error).

**Lineup entry without a roster:**
- Five free-text jersey number fields (existing behaviour).

**BGDL output** is unchanged regardless of roster presence — jersey numbers are always written into the event record as per the BGDL spec. Player names and IDs from the roster are not written into the `.bgdl` file.

---

## 5. Score and Game Clock Calculation

The app maintains an in-memory parse of all BGDL events. At any wall-clock position `T`:

- **Score**: Sum all successful shot events with wall-clock ≤ `T`, adjusted by any score override events ≤ `T`. Point values: `ft` = 1 pt, `3pt` = 3 pts, `2pt` / `dunk` / `pb` = 2 pts. Unsuccessful shot attempts (marked with `-`) contribute zero points.
- **Game Clock**: Derived by interpolation from the most recent `start`, `stop`, `sync`, or game-clock-tagged event before `T`. If the clock is running (last clock event was `start`), the elapsed wall-clock time since that event is subtracted from the game-clock value at that event. If stopped, the game clock holds at the last known value.

Calculation is done client-side on every seekbar position change (i.e. not a round-trip to the server for every seek).

---

## 6. File Management

- The server stores `.bgdl` files. Each game has a server-side ID.
- **Auto-save**: The app sends an updated `.bgdl` file to the server after each event is added, edited, or deleted (debounced — at most one save per 2 seconds of idle).
- **Manual save**: A **Save** button in the header forces an immediate save.
- **Export**: A **Download .bgdl** button sends the current file to the browser as a file download.
- **Import**: Available from the Game List screen. The server parses the uploaded file, stores it, and opens it in the Game Events screen.

---

## 7. Keyboard Shortcuts (Game Events Screen)

| Key | Action |
|---|---|
| Space | Play / Pause |
| `←` / `→` | Step back / forward 5 s |
| `Shift+←` / `Shift+→` | Step back / forward 30 s |
| `N` | New event at current video time (opens Event Entry form) |
| `Escape` | Close Event Entry form without saving |

---

## 8. Validation Rules

- A BGDL file is considered valid if it parses without errors per the BGDL spec.
- Warnings (non-blocking) are surfaced for:
  - Shot events in a 3pt zone recorded as 2pt (or vice versa), when a shot location is provided.
  - Lineups with fewer or more than 5 players.
  - Events recorded with no video URL in the header.
- Errors (blocking — prevent save) are surfaced for:
  - Malformed wall-clock or game-clock values.
  - Unrecognised event type identifiers.
  - Missing required event data fields (e.g. a shot event with no player).

---

## 9. Out of Scope (v1)

- Multi-user / collaborative editing.
- Box score or play-by-play report generation (the `.bgdl` file is the output; reports are a separate concern).
- Live game mode without video (wall clock derived from system clock).
- Importing rosters from external sources (e.g. league databases, CSV files beyond the paste-in feature).
