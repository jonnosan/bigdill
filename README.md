# BGDL (BigDill)  - a language for describing basketball games

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

#### Lineups
These events are used to specify the players on the court for a given team.
For a lineup event, The Event Data shall be all comma delimited list of the jersey numbers for players on court for a single team.  In all but the most exceptional circumstances, this should be 5 players.
|Event Type Identifier|Meaning|Example Detail Record|
|-|-|-|
|la|Lineup for Team A||00:00 LA 0,1,17,8,65 |
|lb|Lineup for Team B||00:20 LB 9,4,1,77,21|



|Event Type Identifier|Meaning|Event Data|Example Detail Record|
|-|-|-|-|
|start| Game Clock is started|n/a|01:02 P1T10:00 start<br>01:12 start|
|stop| Game Clock is stopped (i.e. ref has blown whistle)|n/a|01:12 stop<br>01:53 P1T9:21 STOP|
|sync|Game state is unchanged but is used only to synchronize the game clock and wall clock. |n/a|31:27 p2t05:16 sync|


#### Violations
These events are used to record a violation against a team or player. 
Game Data for such events are either a single team (identified by letter 'A' for "Team A"/Home team or 'B' for "Team B"/Away team, OR an individual player, identified by a letter (A or B) followed by digits representing the jersey number of the player e.g "A 1" or "b27".
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



#### Shot Attempts 
These events are used to record a shot attempt, whether succesful or not. 
Event Data for such events always include:
- The shot type (per the table below)
- A "+" if theshot was succesful and a "-" if the show was unsuccesful. 
- the individual player who attempted the shot, identified by a letter (A or B) followed by digits representing the jersey number of the player e.g "A 1" or "b27". e.g. "23:14 2p-A15" is an unsuccesful 2 pt attempt by the player from Team A wearing jersey 15 
- If the shot was assisted, then there shall be another "+" followed by the jersey number of the player who made the assist (as this is always a team member of the shooter, the team (A or B) is not seperately specified)
- If the shooter was fouled while shooting,  this is indicated by 'SF' (for an ordinary shooting foul), 'UF' for an Unsportsmanlike Foul, and 'DQ' for a Disqualifying foul,  followed by the team and jersey number of the player that was charged with the foul (i.e. the opponent of the shooter). 
-  If a basket is both assisted, and results in a shooting foul, the assist shall appear before the shooting foul. e.g "23:14 2pt+A15+8SFB19"
-  If a shot attempt is blocked by a defender (which by definition of a block, means the shot is unsuccesful, and no foul is called on the defender), then this is indicated by 'BL' followed by  followed by the team and jersey number of the player that was made the block (i.e. the opponent of the shooter). 
-  Optionally the Event Data may include a shot location, specified by a '@' followed by a 2 or 3 character code indicating the  court region where the shot was attempted. For example "23:14 2p+A15+8SFB19 @rim"

##### Shot Types:
|Event Type Identifier|Meaning|Example Detail Record|
|-|-|-  
|2pt|2 Point Shot| "23:14 2pt + A15 +8 SF B 19"|
|3pt|3 Point Shot| "1:93:17 3pt- B28 UF A9"|
|dunk|Dunk| "1:03:17 dunk- A22 BL B1 @rim"|
|pb|Put Back| "43:49 pb+ B18"|
|ft|Free Throw|"41:43 P4T7:13 FT-"|

Note - a 'Put Back'will ALSO result in an offensive rebound being credited to the player specified.

##### Shot Event Modifiers
As described above, the following additional event types may be recorded as part of a Shot Attempt Event.
|Event Type Identifier|Meaning|Event Data|
|-|-|-|
|SF|Shooting Foul|Defender charged with the foul|
|UF|Unsportsmanlike Foul|Defender charged with the foul|
|DQ|Disqualify Foul|Defender charged with the foul|
|BL|Block|Defender that blocked the shot|



##### Regions

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
|TC|Top Centre (including beyond halfway)| 3pt zone|
|TM|Top Mid| 2pt zone|
|TP|Top Paint| 2pt zone|
|RIM|Rim| 2pt zone|
|RC|Right Corner| 3pt zone|
|RM|Right Mid| 2pt zone|
|RP|Right Paint| 2pt zone|
|RW|Right Wing| 3pt zone|
|RE|Right Elbow| 2pt zone|


#### Fouls
Shooting Fouls (including unsportmanlike or disqualifying fouls arising during a shot attempt) are recorded as part of the same event detail record as the shot attempt where the foul occured (as described above).
Non-shooting fouls and tech fouls are recorded with a 2 character code (per table below), with Event Data specifying the player (or coach/bench for tech fouls) charged with the foul.

Where tech fouls are charged against the coach or bench, this shall be recorded with the letter B (for bench fouls) or C (for direct coach fouls) in place of the player jersey number. i.e. '1:03:21 TF BB' is a bench foul called on the 'Team B' bench, and '57:21 DQ AC' is a disqualifying foul called directly on the head coach of team A.

|Event Type Identifier|Foul Type|
|-|-|
|df|Defensive Foul (ordinary foul by team not in possession of the ball e.g. block)| 
|of|Offensive Foul (ordinary foul by team in possession of the ball e.g. charge, moving screen)| 
|tf|Technical Foul|
|uf|Unsportsmanlike Foul|
|dq|Disqualifying Foul|



#### Rebounds
Rebounds occur only after unsuccesful shots. When recording a rebound event, it is not necessary to differentiate offensive rebounds from defensive rebounds, as that can be inferred from whether or not the team making the rebound is the same team as made the shot.


|Event Type Identifier|Meaning|
|-|-|
|rebound|Rebound (other than a putback)| 

##### Special Situations affecting Rebound Events
- where after a missed shot, any player from the offensive team taps the ball in an attempt to get it into the basket, this should be recorded as a single 'Putback' shot attempt (from which an offensive rebound can be inferred when calculating stats), rather than first recording a Rebound event, followed by a seperate  shot attempt.
- Where a ball goes out of bounds after a shot attempt, before either team has established control of the ball, whether or not any player touched the ball first, then there is no 'out of bounds' Event recorded, and a rebound is credited to the team that gains control of the ball.  



#### Held Ball, Turnovers and Steals

Where a team loses control of the ball, other than as a result of a Violation, Foul or Shot Attempt, the player who lost control of the ball shall be charged with a turnover, which is identifed by a 'to' followed by the team (A or B) and jersey number of that player.

Where the turnover is the result of a single defensive players action, the defending player is credited (within the Turnover Event detail record) by 'STL' followed by the (A or B) and jersey number of that player.

Note that per FIBA statistics definitions, when the 'Alternating Possession' rule after  a held ball results in no change in possession, no turnover is recorded. However where possession does change following a held ball, a Turnover is recorded, and a Steal may be credited to the defender that created the held ball.

|Event Type Identifier|Meaning|Example|
|-|-|-|
|to|Turnover|"51:32 TO B43"| 
|stl|Steal|"51:32 TO B43 STL A1"|
