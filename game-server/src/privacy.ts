// The public privacy notice, served as plain text at /privacy (round 22, addendum 2). Keep it true: it describes what the code does (src/net.ts in the halo, src/server.ts, src/memory.ts, src/retention.ts).
export const PRIVACY_NOTICE = `GHOSTCODE: PRIVACY NOTICE (halo and game server)
Operator: Hidden Forces. Last updated: 2026-11-25.

What this is: Ghostcode Halo is a Decentraland smart wearable for the game Ghostcode. While it runs, it talks to one game server we run, ghostcode.hiddenforces.net, over HTTPS. It asks one permission, "Use the Fetch API". It does not ask for a signature, move funds, or open links.

WHEN THE HALO SENDS ANYTHING ABOUT YOU
Putting the halo on does not start the game for you. Until you join, you stay a stock avatar, the halo changes nothing about how you move, and it sends nothing about you: it only asks our server, about once every few seconds, whether a game is open and where its starting bubble is. That question carries the halo's version number and nothing that names you (no wallet address, no name, no position). The server counts how many such questions arrive per minute, as a number only, to guess how many halos are running.
You join by standing inside the game's glowing bubble and holding E for about a second and a half. Only from then on does the halo send what is listed below.
You can stop at any time: hold Ctrl + Shift + E. While you hold it the halo is paused and sends nothing; held for three seconds, it stays off for good until you take the halo off and put it on again. This is read by the halo on your own computer, so our server cannot override it.
The server gives you a short "lease" (20 seconds at a time) each time it answers one of your reports. The halo's powers only run while a lease is valid and lapse by themselves if the server stops answering or you stand still for five minutes. The server can also tell every halo to switch itself off, and then nothing is drawn and nothing about you is sent.

WHAT LEAVES YOUR COMPUTER
Up to four times a second after you have joined, while the halo is running and can reach the server, the halo sends:
  - your wallet address,
  - your Decentraland display name,
  - your position in the world (x, y, z) and the position as the scene sees it,
  - your speed and your current power tier,
  - the side you are on in the game (hunters or helpers),
  - game events (for example "placed a plume", "pressed a key", "joined through the call", "blast launched"),
  - the halo's version numbers (its build id, its protocol version and the version of the settings it holds), so the server can tell which halo you run.
The published halo sends no diagnostic reports. (Test copies of the halo used by the developers also send short technical test reports; see the diagnostic file below.)
The server may switch the halo off at any time ("idle"): while idle it sends nothing about you; it only asks, with no personal field, whether to wake up.
Nothing else: no keystrokes outside the game's own keys, no data about other avatars, no files, no wallet signing.

WHAT THE SYNTH'S COMPUTER SEES
The Synth is the game's own character: an ordinary Decentraland avatar named "Synth (AI)", run by our software. Its client sees what any avatar nearby sees: other avatars' addresses, names and positions, and public nearby chat. On the computer that runs it, the client's own log holds that for the time it runs; the log is emptied every day and whenever the Synth is restarted, and it is never uploaded. The bridge's logs there hold only counts and the Synth's own position. Our test logs hold only throwaway test accounts.

WHERE IT GOES, AND WHERE IT IS HANDLED
Only to our server at ghostcode.hiddenforces.net (a rented virtual server). It is not sent to Decentraland and not shared with anyone else, except what the sections below say other players in the same match see. The Synth runs as a Decentraland client on a computer we operate, which talks to the server through a link we run (the "bridge"); that computer therefore also handles what the Synth sees (see above).

WHAT OTHER PLAYERS IN YOUR MATCH SEE
  - The blast trail: when the game throws you into the sky (the blast), your halo draws a smoke-and-ember trail behind you, and every other joined player's halo draws the same trail behind you while you are in the air, so everyone can see where the others fly. For this the server shares the position (x, y, z) of each airborne joined player with the other joined players, a few times a second. Only positions: no name, no wallet address, no avatar details. It stops as soon as you land, and nothing about the trail is kept beyond the running match.
  - The blast point: the server notes where a blast was launched (a position, with no name or address) for a few seconds and tells every halo nearby, so the blast can be drawn for everyone. Others see that a blast happened at that place, not who launched it.
  - Plumes and traps: where you place a plume or a trap is shown to the others in the same match, as a location, without saying who placed it.
  - Nothing else about you: the server does not send other players your address, your name, or your position on the ground.

WHAT IS NOT ABOUT ANY PLAYER
  - The Glimpse Signal: the tall pale column that appears after each blast shows the position of the Synth (the game's own character), never the position of a player.
  - The call: when a game is opening and few players are near, the server can send every halo a "call": the position of the starting bubble, for a limited time. Halos far from the bubble show a portal to it. A call carries no information about any player. If you join through the call, the halo reports "joined through the call" like any other game event, and the server counts it.
  - The portals at a round change and at the end of the game are drawn where the Synth stands.

THE REPLAY PORTALS
At the end of a match two portals stand for ten seconds. Walking into one picks your side for the next game. If you already joined this session and have not stopped the halo (Ctrl + Shift + E), staying near the portals keeps you in the game: there is no second prompt. A wearer who never joined must still hold E for a second and a half to join, and nothing about that wearer is sent before they do. If you walk away, you leave the game.

WHAT THE SERVER SENDS BACK TO YOUR HALO
Every reply carries the state of the match, so your halo can draw it: the match mode, round, timer and score; your own state (plumes left, boost, trap, tier); the Synth's position; the position and time left of plumes, traps, power-up drops, the lobby bubble and the portals; how many players are inside the lobby bubble (a number); and, while players are in the air after a blast, their positions for the trail (see above).

WHAT THE SERVER KEEPS, AND FOR HOW LONG
  - Your live player record (name, position, speed, tier, side): in memory only, while you are in a match. It is gone when you leave the match or when the server restarts. Positions are not stored as a history; the only positions that reach disk are inside the developers' diagnostic reports below.
  - A small play record kept by address, only if you joined the game: when you last played, which side, how it went. Deleted automatically 90 days after you last played.
  - What you say to the Synth: the Synth reads the public nearby chat of the Decentraland world when you are within about 60 metres of it (the same public chat anyone nearby can read).
      If you joined the game through the Ghostcode Halo: it keeps your address and the first line of what you said (up to 120 characters) so it can greet you later, and "no" tells it to leave you alone for a day. Deleted automatically 90 days after you last talked or played.
      If you have not joined through the halo: the Synth remembers nothing about you. It may answer you in the moment, but it stores nothing about you and logs nothing that identifies you. If you tell it "no", it keeps away from you only until the server restarts; that is held in memory, never written to disk.
      Records kept before this change about people who never joined were deleted on 22 November 2026.
  - A diagnostic file of technical test reports from the developers' test copies of the halo (an address shortened to its first 10 characters, plus a technical result; a report of a test teleport or a blast includes positions). The published halo does not send these. Deleted automatically after 30 days.
  - Connection addresses (IP): the server does not store them. Our web server keeps no access log for this site, and refused-request lines do not contain the address. (Short-term, an address is held in memory to limit how fast one address can send requests; it is dropped when the player leaves.)

YOUR CHOICES
You can stop at any time by taking the halo off, or with Ctrl + Shift + E. To have everything we hold about your address deleted, message "hiddenforces" on Discord with your wallet address; we delete the play record, what the Synth remembers about you, the diagnostic lines and any live record, and tell you what was removed.

CONTACT
Discord: hiddenforces.

This notice describes how the server behaves today. If that changes, this page changes first.
`

// The notice live on 2026-11-25 before the address moved to ghostcode.hiddenforces.net (Directive AC; kept for the record and a quick rollback)
export const PRIVACY_NOTICE_2026_11_25_EMANATE_ADDRESS = `GHOSTCODE: PRIVACY NOTICE (halo and game server)
Operator: Hidden Forces. Last updated: 2026-11-25.

What this is: Ghostcode Halo is a Decentraland smart wearable for the game Ghostcode. While it runs, it talks to one game server we run, emanate.hiddenforces.net, over HTTPS. It asks one permission, "Use the Fetch API". It does not ask for a signature, move funds, or open links.

WHEN THE HALO SENDS ANYTHING ABOUT YOU
Putting the halo on does not start the game for you. Until you join, you stay a stock avatar, the halo changes nothing about how you move, and it sends nothing about you: it only asks our server, about once every few seconds, whether a game is open and where its starting bubble is. That question carries the halo's version number and nothing that names you (no wallet address, no name, no position). The server counts how many such questions arrive per minute, as a number only, to guess how many halos are running.
You join by standing inside the game's glowing bubble and holding E for about a second and a half. Only from then on does the halo send what is listed below.
You can stop at any time: hold Ctrl + Shift + E. While you hold it the halo is paused and sends nothing; held for three seconds, it stays off for good until you take the halo off and put it on again. This is read by the halo on your own computer, so our server cannot override it.
The server gives you a short "lease" (20 seconds at a time) each time it answers one of your reports. The halo's powers only run while a lease is valid and lapse by themselves if the server stops answering or you stand still for five minutes. The server can also tell every halo to switch itself off, and then nothing is drawn and nothing about you is sent.

WHAT LEAVES YOUR COMPUTER
Up to four times a second after you have joined, while the halo is running and can reach the server, the halo sends:
  - your wallet address,
  - your Decentraland display name,
  - your position in the world (x, y, z) and the position as the scene sees it,
  - your speed and your current power tier,
  - the side you are on in the game (hunters or helpers),
  - game events (for example "placed a plume", "pressed a key", "joined through the call", "blast launched"),
  - the halo's version numbers (its build id, its protocol version and the version of the settings it holds), so the server can tell which halo you run.
The published halo sends no diagnostic reports. (Test copies of the halo used by the developers also send short technical test reports; see the diagnostic file below.)
The server may switch the halo off at any time ("idle"): while idle it sends nothing about you; it only asks, with no personal field, whether to wake up.
Nothing else: no keystrokes outside the game's own keys, no data about other avatars, no files, no wallet signing.

WHAT THE SYNTH'S COMPUTER SEES
The Synth is the game's own character: an ordinary Decentraland avatar named "Synth (AI)", run by our software. Its client sees what any avatar nearby sees: other avatars' addresses, names and positions, and public nearby chat. On the computer that runs it, the client's own log holds that for the time it runs; the log is emptied every day and whenever the Synth is restarted, and it is never uploaded. The bridge's logs there hold only counts and the Synth's own position. Our test logs hold only throwaway test accounts.

WHERE IT GOES, AND WHERE IT IS HANDLED
Only to our server at emanate.hiddenforces.net (a rented virtual server). It is not sent to Decentraland and not shared with anyone else, except what the sections below say other players in the same match see. The Synth runs as a Decentraland client on a computer we operate, which talks to the server through a link we run (the "bridge"); that computer therefore also handles what the Synth sees (see above).

WHAT OTHER PLAYERS IN YOUR MATCH SEE
  - The blast trail: when the game throws you into the sky (the blast), your halo draws a smoke-and-ember trail behind you, and every other joined player's halo draws the same trail behind you while you are in the air, so everyone can see where the others fly. For this the server shares the position (x, y, z) of each airborne joined player with the other joined players, a few times a second. Only positions: no name, no wallet address, no avatar details. It stops as soon as you land, and nothing about the trail is kept beyond the running match.
  - The blast point: the server notes where a blast was launched (a position, with no name or address) for a few seconds and tells every halo nearby, so the blast can be drawn for everyone. Others see that a blast happened at that place, not who launched it.
  - Plumes and traps: where you place a plume or a trap is shown to the others in the same match, as a location, without saying who placed it.
  - Nothing else about you: the server does not send other players your address, your name, or your position on the ground.

WHAT IS NOT ABOUT ANY PLAYER
  - The Glimpse Signal: the tall pale column that appears after each blast shows the position of the Synth (the game's own character), never the position of a player.
  - The call: when a game is opening and few players are near, the server can send every halo a "call": the position of the starting bubble, for a limited time. Halos far from the bubble show a portal to it. A call carries no information about any player. If you join through the call, the halo reports "joined through the call" like any other game event, and the server counts it.
  - The portals at a round change and at the end of the game are drawn where the Synth stands.

THE REPLAY PORTALS
At the end of a match two portals stand for ten seconds. Walking into one picks your side for the next game. If you already joined this session and have not stopped the halo (Ctrl + Shift + E), staying near the portals keeps you in the game: there is no second prompt. A wearer who never joined must still hold E for a second and a half to join, and nothing about that wearer is sent before they do. If you walk away, you leave the game.

WHAT THE SERVER SENDS BACK TO YOUR HALO
Every reply carries the state of the match, so your halo can draw it: the match mode, round, timer and score; your own state (plumes left, boost, trap, tier); the Synth's position; the position and time left of plumes, traps, power-up drops, the lobby bubble and the portals; how many players are inside the lobby bubble (a number); and, while players are in the air after a blast, their positions for the trail (see above).

WHAT THE SERVER KEEPS, AND FOR HOW LONG
  - Your live player record (name, position, speed, tier, side): in memory only, while you are in a match. It is gone when you leave the match or when the server restarts. Positions are not stored as a history; the only positions that reach disk are inside the developers' diagnostic reports below.
  - A small play record kept by address, only if you joined the game: when you last played, which side, how it went. Deleted automatically 90 days after you last played.
  - What you say to the Synth: the Synth reads the public nearby chat of the Decentraland world when you are within about 60 metres of it (the same public chat anyone nearby can read).
      If you joined the game through the Ghostcode Halo: it keeps your address and the first line of what you said (up to 120 characters) so it can greet you later, and "no" tells it to leave you alone for a day. Deleted automatically 90 days after you last talked or played.
      If you have not joined through the halo: the Synth remembers nothing about you. It may answer you in the moment, but it stores nothing about you and logs nothing that identifies you. If you tell it "no", it keeps away from you only until the server restarts; that is held in memory, never written to disk.
      Records kept before this change about people who never joined were deleted on 22 November 2026.
  - A diagnostic file of technical test reports from the developers' test copies of the halo (an address shortened to its first 10 characters, plus a technical result; a report of a test teleport or a blast includes positions). The published halo does not send these. Deleted automatically after 30 days.
  - Connection addresses (IP): the server does not store them. Our web server keeps no access log for this site, and refused-request lines do not contain the address. (Short-term, an address is held in memory to limit how fast one address can send requests; it is dropped when the player leaves.)

YOUR CHOICES
You can stop at any time by taking the halo off, or with Ctrl + Shift + E. To have everything we hold about your address deleted, message "hiddenforces" on Discord with your wallet address; we delete the play record, what the Synth remembers about you, the diagnostic lines and any live record, and tell you what was removed.

CONTACT
Discord: hiddenforces.

This notice describes how the server behaves today. If that changes, this page changes first.
`

// The notice that was live until 2026-11-25 (before the rename to Ghostcode; kept for the record and a quick rollback: serve this instead of PRIVACY_NOTICE)
export const PRIVACY_NOTICE_2026_11_24 = `EMANATE: PRIVACY NOTICE (halo and game server)
Operator: Hidden Forces. Last updated: 2026-11-24.

What this is: Emanate Halo is a Decentraland smart wearable for the game Emanate. While it runs, it talks to one game server we run, emanate.hiddenforces.net, over HTTPS. It asks one permission, "Use the Fetch API". It does not ask for a signature, move funds, or open links.

WHEN THE HALO SENDS ANYTHING ABOUT YOU
Putting the halo on does not start the game for you. Until you join, you stay a stock avatar, the halo changes nothing about how you move, and it sends nothing about you: it only asks our server, about once every few seconds, whether a game is open and where its starting bubble is. That question carries the halo's version number and nothing that names you (no wallet address, no name, no position). The server counts how many such questions arrive per minute, as a number only, to guess how many halos are running.
You join by standing inside the game's glowing bubble and holding E for about a second and a half. Only from then on does the halo send what is listed below.
You can stop at any time: hold Ctrl + Shift + E. While you hold it the halo is paused and sends nothing; held for three seconds, it stays off for good until you take the halo off and put it on again. This is read by the halo on your own computer, so our server cannot override it.
The server gives you a short "lease" (20 seconds at a time) each time it answers one of your reports. The halo's powers only run while a lease is valid and lapse by themselves if the server stops answering or you stand still for five minutes. The server can also tell every halo to switch itself off, and then nothing is drawn and nothing about you is sent.

WHAT LEAVES YOUR COMPUTER
Up to four times a second after you have joined, while the halo is running and can reach the server, the halo sends:
  - your wallet address,
  - your Decentraland display name,
  - your position in the world (x, y, z) and the position as the scene sees it,
  - your speed and your current power tier,
  - the side you are on in the game (hunters or helpers),
  - game events (for example "placed a plume", "pressed a key", "joined through the call", "blast launched"),
  - the halo's version numbers (its build id, its protocol version and the version of the settings it holds), so the server can tell which halo you run.
The published halo sends no diagnostic reports. (Test copies of the halo used by the developers also send short technical test reports; see the diagnostic file below.)
The server may switch the halo off at any time ("idle"): while idle it sends nothing about you; it only asks, with no personal field, whether to wake up.
Nothing else: no keystrokes outside the game's own keys, no data about other avatars, no files, no wallet signing.

WHAT THE SYNTH'S COMPUTER SEES
The Synth is the game's own character: an ordinary Decentraland avatar named "Synth (AI)", run by our software. Its client sees what any avatar nearby sees: other avatars' addresses, names and positions, and public nearby chat. On the computer that runs it, the client's own log holds that for the time it runs; the log is emptied every day and whenever the Synth is restarted, and it is never uploaded. The bridge's logs there hold only counts and the Synth's own position. Our test logs hold only throwaway test accounts.

WHERE IT GOES, AND WHERE IT IS HANDLED
Only to our server at emanate.hiddenforces.net (a rented virtual server). It is not sent to Decentraland and not shared with anyone else, except what the sections below say other players in the same match see. The Synth runs as a Decentraland client on a computer we operate, which talks to the server through a link we run (the "bridge"); that computer therefore also handles what the Synth sees (see above).

WHAT OTHER PLAYERS IN YOUR MATCH SEE
  - The blast trail: when the game throws you into the sky (the blast), your halo draws a smoke-and-ember trail behind you, and every other joined player's halo draws the same trail behind you while you are in the air, so everyone can see where the others fly. For this the server shares the position (x, y, z) of each airborne joined player with the other joined players, a few times a second. Only positions: no name, no wallet address, no avatar details. It stops as soon as you land, and nothing about the trail is kept beyond the running match.
  - The blast point: the server notes where a blast was launched (a position, with no name or address) for a few seconds and tells every halo nearby, so the blast can be drawn for everyone. Others see that a blast happened at that place, not who launched it.
  - Plumes and traps: where you place a plume or a trap is shown to the others in the same match, as a location, without saying who placed it.
  - Nothing else about you: the server does not send other players your address, your name, or your position on the ground.

WHAT IS NOT ABOUT ANY PLAYER
  - The Glimpse Signal: the tall pale column that appears after each blast shows the position of the Synth (the game's own character), never the position of a player.
  - The call: when a game is opening and few players are near, the server can send every halo a "call": the position of the starting bubble, for a limited time. Halos far from the bubble show a portal to it. A call carries no information about any player. If you join through the call, the halo reports "joined through the call" like any other game event, and the server counts it.
  - The portals at a round change and at the end of the game are drawn where the Synth stands.

THE REPLAY PORTALS
At the end of a match two portals stand for ten seconds. Walking into one picks your side for the next game. If you already joined this session and have not stopped the halo (Ctrl + Shift + E), staying near the portals keeps you in the game: there is no second prompt. A wearer who never joined must still hold E for a second and a half to join, and nothing about that wearer is sent before they do. If you walk away, you leave the game.

WHAT THE SERVER SENDS BACK TO YOUR HALO
Every reply carries the state of the match, so your halo can draw it: the match mode, round, timer and score; your own state (plumes left, boost, trap, tier); the Synth's position; the position and time left of plumes, traps, power-up drops, the lobby bubble and the portals; how many players are inside the lobby bubble (a number); and, while players are in the air after a blast, their positions for the trail (see above).

WHAT THE SERVER KEEPS, AND FOR HOW LONG
  - Your live player record (name, position, speed, tier, side): in memory only, while you are in a match. It is gone when you leave the match or when the server restarts. Positions are not stored as a history; the only positions that reach disk are inside the developers' diagnostic reports below.
  - A small play record kept by address, only if you joined the game: when you last played, which side, how it went. Deleted automatically 90 days after you last played.
  - What you say to the Synth: the Synth reads the public nearby chat of the Decentraland world when you are within about 60 metres of it (the same public chat anyone nearby can read).
      If you joined the game through the Emanate Halo: it keeps your address and the first line of what you said (up to 120 characters) so it can greet you later, and "no" tells it to leave you alone for a day. Deleted automatically 90 days after you last talked or played.
      If you have not joined through the halo: the Synth remembers nothing about you. It may answer you in the moment, but it stores nothing about you and logs nothing that identifies you. If you tell it "no", it keeps away from you only until the server restarts; that is held in memory, never written to disk.
      Records kept before this change about people who never joined were deleted on 22 November 2026.
  - A diagnostic file of technical test reports from the developers' test copies of the halo (an address shortened to its first 10 characters, plus a technical result; a report of a test teleport or a blast includes positions). The published halo does not send these. Deleted automatically after 30 days.
  - Connection addresses (IP): the server does not store them. Our web server keeps no access log for this site, and refused-request lines do not contain the address. (Short-term, an address is held in memory to limit how fast one address can send requests; it is dropped when the player leaves.)

YOUR CHOICES
You can stop at any time by taking the halo off, or with Ctrl + Shift + E. To have everything we hold about your address deleted, message "hiddenforces" on Discord with your wallet address; we delete the play record, what the Synth remembers about you, the diagnostic lines and any live record, and tell you what was removed.

CONTACT
Discord: hiddenforces.

This notice describes how the server behaves today. If that changes, this page changes first.
`

// The notice that was live until 2026-11-24 (kept for the record and a quick rollback: serve this instead of PRIVACY_NOTICE)
export const PRIVACY_NOTICE_2026_11_19 = `EMANATE: PRIVACY NOTICE (halo and game server)
Operator: Hidden Forces. Last updated: 2026-11-19.

What this is: Emanate Halo is a Decentraland smart wearable for the game Emanate. While it runs, it talks to one game server we run, emanate.hiddenforces.net, over HTTPS. It asks one permission, "Use the Fetch API". It does not ask for a signature, move funds, or open links.

WHEN THE HALO SENDS ANYTHING ABOUT YOU
Putting the halo on does not start the game for you. Until you join, you stay a stock avatar, the halo changes nothing about how you move, and it sends nothing about you: it only asks our server, about once every few seconds, whether a game is open and where its starting bubble is. That question carries the halo's version number and nothing that names you (no wallet address, no name, no position). The server counts how many such questions arrive per minute, as a number only, to guess how many halos are running.
You join by standing inside the game's glowing bubble and holding E for about a second and a half. Only from then on does the halo send what is listed below.
You can stop at any time: hold Ctrl + Shift + E. While you hold it the halo is paused and sends nothing; held for three seconds, it stays off for good until you take the halo off and put it on again. This is read by the halo on your own computer, so our server cannot override it.
The server gives you a short "lease" (20 seconds at a time) each time it answers one of your reports. The halo's powers only run while a lease is valid and lapse by themselves if the server stops answering or you stand still for five minutes. The server can also tell every halo to switch itself off, and then nothing is drawn and nothing about you is sent.

WHAT LEAVES YOUR COMPUTER
Up to four times a second after you have joined, while the halo is running and can reach the server, the halo sends:
  - your wallet address,
  - your Decentraland display name,
  - your position in the world (x, y, z) and the position as the scene sees it,
  - your speed and your current power tier,
  - the side you chose in the game (hunters or helpers),
  - game events (for example "placed a plume", "pressed a key", "joined through the call", "blast launched") and short diagnostic messages.
  - the halo's version numbers (its build id, its protocol version and the version of the settings it holds), so the server can tell which halo you run.
The server may switch the halo off at any time ("idle"): while idle it sends nothing about you; it only asks, with no personal field, whether to wake up.
Nothing else: no keystrokes outside the game's own keys, no data about other avatars, no files, no wallet signing.

WHAT THE SYNTH'S COMPUTER SEES
The Synth is an ordinary Decentraland avatar, so its client sees what any avatar nearby sees: other avatars' addresses, names and positions, and public nearby chat. On the computer that runs it, the client's own log holds that for the time it runs; the log is emptied every day and whenever the Synth is restarted, and it is never uploaded. The bridge's logs there hold only counts and the Synth's own position. Our test logs hold only throwaway test accounts.

WHERE IT GOES, AND WHERE IT IS HANDLED
Only to our server at emanate.hiddenforces.net (a rented virtual server). It is not sent to Decentraland and not shared with anyone else. The game character, the Synth, runs as a Decentraland client on a computer we operate, which talks to the server through a link we run (the "bridge"); that computer therefore also handles what the Synth sees (see below).

THE BLAST AND THE CALL
Blast: when a player is thrown into the sky by the game's "blast" (it can be triggered by the game or by the player's own key), the server notes the launch point (a position, with no name or address) for a few seconds and tells every halo nearby so the red bubble can be drawn for everyone. Others see that a blast happened at that place, not who launched it.
Call: when a game is opening and few players are near, the server can send every halo a "call": the position of the starting bubble, for a limited time. Halos far from the bubble show a portal to it. A call carries no information about any player. If you join through the call, the halo reports "joined through the call" like any other game event, and the server counts it.

WHAT THE SERVER SENDS BACK TO YOUR HALO
Every reply carries the state of the match, so your halo can draw it: the match mode, round, timer and score; your own state (plumes left, boost, trap, tier); the Synth's position and whether it is in a dead zone; the position and time left of plumes, traps, power-up drops, the lobby bubble and the endgame; and how many players are inside the lobby bubble (a number). It does NOT send other players' addresses, names or positions to your halo. What other players place (plumes, traps) is visible to everyone in the match as a location, without saying who placed it. So "not shared with anyone else" holds for other players' halos, with that one exception: where you place a plume or trap is shown to the others in the same match.

WHAT THE SERVER KEEPS, AND FOR HOW LONG
  - Your live player record (name, position, speed, tier, side): in memory only, while you are in a match. It is gone when you leave the match or when the server restarts. Positions are not stored as a history; the only positions that reach disk are inside the diagnostic reports below.
  - A small play record kept by address: when you last played, which side, how it went. Deleted automatically 90 days after you last played.
  - What you say to the Synth: the Synth reads the public nearby chat of the Decentraland world when you are within about 60 metres of it (the same public chat anyone nearby can read). For anyone who talks near it, it keeps your address and the first line of what you said (up to 120 characters) so it can greet you later, and "no" tells it to leave you alone for a day. Deleted automatically 90 days after you last talked.
  - A diagnostic file of technical test reports from the halo (your address shortened to its first 10 characters, plus a technical result; a report of a test teleport includes the positions it moved from and to). Deleted automatically after 30 days.
  - Connection addresses (IP): the server does not store them. Our web server keeps no access log for this site, and refused-request lines no longer contain the address. (Short-term, an address is held in memory to limit how fast one address can send requests; it is dropped when the player leaves.)

YOUR CHOICES
You can stop at any time by taking the halo off. To have everything we hold about your address deleted, message "hiddenforces" on Discord with your wallet address; we delete the play record, the diagnostic lines and any live record, and tell you what was removed.

CONTACT
Discord: hiddenforces.

This notice describes how the server behaves today. If that changes, this page changes first.
`
