#BGDL - a language for descriping basketball games

##Design Goals
- quick and easy for an expert user to manually enter
- easy to convert to a human readable 'play by play'
- facilitates interoperability between different software applications 
- describe all elements of a basketball game that are currently recorded by sideline statisticians conforming to [FIBA Statisticians Manual] (https://nz.basketball/wp-content/uploads/2024/10/FIBA-Statisticians-Manual-2024-1.0.pdf)
- simplifies synchronization between game clock and wall clock, allowing for errors and discontinuities in both 

##Inspirations
https://www.willhart.io/post/basketball-analysis-software/#building-a-tagging-language 

https://en.wikipedia.org/wiki/Algebraic_notation_(chess) 

##Non-Goals
|Non-Goal|Rationale|
| --- | --- |
|Actions outside FIBA stats manual (e.g. inbounds, passes,names of plays) |Not required for initial use cases, although could be added in future|
|Easy entry by novices| It's assumed that only advanced users would directly enter BGDL, while others use a GUI front end that generates BGDL in the background|




#BGDL format

A BGDL file (or record)  consists of:

- A header containing metadata about the game being described, followed by
- zero or more events
