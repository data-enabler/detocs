# DETOCS
Datagram's Esports Tournament Overlay Control System (DETOCS) is a tool designed to allow a stream producer to completely manage an esports broadcast, including: updating scoreboards and overlays, pulling data from bracket services, sharing status updates and highlights on social media, and uploading VoDs.
I (Datagram) created DETOCS to simplify and streamline my own workflows while broadcasting tournaments for [Lunar Phase](https://www.lunarphase.nyc/); I've decided to share this tool in the hopes that others find it just as useful.

Bear in mind that DETOCS is currently alpha-stage software. There will be (hopefully minor) bugs, and there will (probably) be backwards-incompatible changes.
If it's any consolation, I use this program on a regular basis so I'm probably breaking my own stuff too.

## Features

### Overlay Compatibility
DETOCS won't force you to rewrite all your overlays just to use it.
Its extremely flexible output system lets you use it as a drop-in replacement for pretty much any overlay that reads its data from a file or via WebSocket.
If you're streaming at a tournament where you're forced to use overlays authored by someone else, simply configure DETOCS to impersonate whatever format their overlays expect.

### Cross-Platform Compatibility
Since it's built on platform-agnostic technologies, DETOCS can be used not only on Windows but on MacOS and Linux as well.
DETOCS is currently only being tested on Windows, so consider MacOS and Linux support to be it'll-probably-work-tier.

### Open Source
DETOCS is licensed under the AGPL V3 license, meaning open access to the source code and the ability to make whataver modifications you want.
Bear in mind that if you distribute modified copies of the program (including allowing others to use the program via the internet), you must make the source code available as well.

## Non-Features

### Cloud Hosting
Event streamers constantly have to worry about having their broadcast ruined by things outside their control, and I'd rather not add "Datagram's DNS configuration" and "Datagram's web hosting" to the list of potentials.
You're welcome to host DETOCS wherever you want, but you will never be _required_ to use a cloud-hosted app.

## Getting Started

## Overview

### Scoreboard Tab
The scoreboard tab allows you to enter details for the current tournament match.
-

### Commentary Tab

### Recording Tab

### Twitter Tab

### Clips Tab

### Bracket Tab

### Break Tab
Set messages to display on break scenes

### Settings Tab
This tab is currently just used to control a couple of client-side settings.
Reverse the order of the player or commentator fields to whatever feels more natural.

## Dependencies
- (optional) [OBS](https://obsproject.com/) version 23 or later
- (optional) [obs-websocket](https://github.com/Palakis/obs-websocket) version 4.7 or later

## Known Issues
- DETOCS currently does not queue smash.gg requests to account for their API rate limits, meaning that very large queries will result in errors (instead of being spread out over several minutes).
It should be able to handle major tournaments, but not supermajors.

## Alternatives
- StreamControl (open source): 
- PIIO (Production Interface IO):
- Scoreboard Assistant:
