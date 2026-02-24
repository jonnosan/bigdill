# BGDL (Bigdill)  - a language for describing basketball games

## Purpose
BGDL is intended to allow a skilled user to quickly record events in a basketball game (in realtime, or while watching a video of the game), in a format that will allow later processing to:
- generate human readable play by plays, boxscores, and other statistics
- find portions of video that show specifc events in a game for later retrieval (for example, to allow retrieval of videos of all 3 point attempts by a particular player in a season)


## Design Goals
- quick and easy for an expert user to manually enter
- easy to convert to a human readable 'play by play'
- facilitates interoperability between different software applications 
- describe all elements of a basketball game that are currently recorded by sideline statisticians conforming to [FIBA Statisticians Manual] (https://nz.basketball/wp-content/uploads/2024/10/FIBA-Statisticians-Manual-2024-1.0.pdf)
- simplifies synchronization between game clock and wall clock, allowing for errors and discontinuities in both 

## Inspirations
https://www.willhart.io/post/basketball-analysis-software/#building-a-tagging-language 
https://en.wikipedia.org/wiki/Algebraic_notation_(chess) 

## Non-Goals
|Non-Goal|Rationale|
| --- | --- |
|Actions outside FIBA stats manual (e.g. inbounds, passes,names of plays) |Not required for initial use cases, could be added in future|
|Easy entry by novices| It's assumed that only advanced users would directly enter BGDL, while others use a GUI front end that generates BGDL in the background|



# BGDL format

A BGDL file (or record)  consists of:

- A header containing zero or more metadata records about the game being described, followed by
- zero or more detail records describing events in the game



## Comments
A # character is used to mark the start of a comment, and all text from a # to the end of the line will be ignored
lines consisting solely of whitespace or comments are ignored

## Header
A header contains tags, one per line, containing information about the game.
Each tag consists of a single uppercase word followed by a colon and then a tag value
Whitespace on either side of the colon is allowed but not required

|Tag|Samples|Description|
|-|-|-|
|GAME|GAME: Waratah 1 Youth Men Grand Final 2025|Free form text that can be used by a human to distinguish this game from any others|
|PERIODS|PERIODS: 4x10+5<br>PERIODS:2 X 20|The number and duration of periods during a standard game (seperated by an 'x' or 'X'), optionally followed by a plus sign and then the duration of any overtime periods, whether or not overtime was required in this game|  
|DATE|DATE:2025-08-24<br>DATE: 2025-08-24T11:00:00<br>DATE:2025-08-24T11:00:00+10:0 |Game date (possibily with time) in any valid ISO 8601 format|
|VIDEO|VIDEO : https://www.youtube.com/watch?v=odm3WiK5wC4 |URL of a video of the game|
|A| A: Bankstown Bruins<br>A:BAN,Blue|Name (or team code) of 'Team A' (sometimes called the Home team). Optionally, the team name/code may be followed by a comma and then the predominant colour of the jersey worn by this team in this game|
|B| B: Hills Hornets<br>B:HIL, Green|Name (or team code) of 'Team B' (sometimes called the Away team). Optionally, the team name/code may be followed by a comma and then the predominant colour of the jersey worn by this team in this game|


## Events

An event consists of:
1. a Time Tag (wall clock, optionally inclusive of game clock)
2. an Event Type Identifier
3. Event Data

### Time Tags
A Time Tag consists of a Wall Clock value, and (optionally) whitespace followed by a Game Clock value


#### Wall Clock

Wall clock may be recorded in absolute terms (for example as a full ISO-8601 datetime), or relative to some base time (for example, the start of a video - where an event with time tag '3:51' occurs at 3 minutes and 51 seconds into that video). 

At minimum, a time tag consists of one or 2 digits of minutes, followed by a colon, followed by seconds, e.g. '0:01', '00:35', '31:54'

Optionally, a time tag can contain one or 2 digits of hours, and/or fractions of seconds. e.g. '01:32:35','01:32:35.276', '19:41.2'

The wall clock MAY be *preceded* by whitespace, but there MUST NOT be whitespace *within* the wall clock value. e.g. '  03:12' is valid, but '03 : 12' is not.

#### Game Clock
After any Wall Clock tag, seperated with whitespace, a Game Clock may be specified.
Whenever a Game Clock time is specified, it shall be in the form "P<period number>T<time remaining in period>"
In a FIBA standard game, the tipoff would occur at 'P1T10:00', and 'P6T00:03.27' would represent 3.27 seconds remaining in a 2nd overtime period.


### Event Type Identifiers
An Event Type Identifier is a short code which specifies the type of event being recorded.

#### Game Clock Events
These events are used to start/stop the game clock, and synchronize the game clock and wall clock
|Event Type Identifier|Meaning|Event Data|Example Detail Record|
|-|-|-|-|
|start| Game Clock is started|n/a|01:02 P1T10:00 start<br>01:12 start|
|stop| Game Clock is stopped (i.e. ref has blown whistle)|n/a|01:12 stop<br>01:53 P1T9:21 STOP|
|sync|Game state is unchanged but is used only to synchronize the game clock and wall clock. |n/a|31:27 p2t05:16 sync|

#### Violations
These events are used to record a violation against a team or player. Whenever a violation is recorded, the game clock is implicitly stopped.
Game Date for such events are either a single team (identified by letter 'A' for "Team A"/Home team or 'B' for "Team B"/Away team, OR an individual player, identified by a letter (A or B) followed by digits representing the jersey number of the player e.g "A 1" or "b27".
|Event Type Identifier|Meaning|Event Data|Example Detail Record|
|-|-|-|-|
|travel|Travel|Team or Player who was called for travelling| 02:41 travel b27|
|out|Out of Bounds| Team or Player that last touched the ball before it went out of bounds | 02:41 out A|
|back|Backcourt Violation| Team or player touched the ball after it crossed back in to the backcourt | 12:47 P1T7:17 back B9|
|double|Double Dribble| Team or player that double dribbled|8:16 double A4|
|shotclock|Shot Clock violation| Team in possession when shot clock expired|8:16 shotclock b|
|3s|Three Second violation - too long in restricted area| Team or player penalised|8:16 3s A 8|
|5s|Five Second violation - holding ball too long before inbounding or while closely guarded| Team or player penalised|8:16 5s A 8|
|8s|Eight Second violation - Taking too long to advance ball over halfwy| Team or player penalised|8:16 8s A 8|









### Regions

Regions of the court are named according to the following diagram 

![basketball court geography](https://raw.githubusercontent.com/jonnosan/bigdill/refs/heads/main/img/basketball_court_regions.png)


Region are identified by an abbreviation, according to the following table:

|Abbreviation|Region|2 or 3 pt zone?|
|-|-|-|
|LC|Left Corner| 3pt zone|
|LM|Left Mid| 2pt zone|
|LP|Left Paint| 2pt zone|
|LW|Left Wing| 3pt zone|
|LE|Left Elbow| 2pt zone|
|TC|Top Centre| 3pt zone|
|TM|Top Mid| 2pt zone|
|TP|Top Paint| 2pt zone|
|RIM|Rim| 2pt zone|
|RC|Right Corner| 3pt zone|
|RM|Right Mid| 2pt zone|
|RP|Right Paint| 2pt zone|
|RW|Right Wing| 3pt zone|
|RE|Right Elbow| 2pt zone|




