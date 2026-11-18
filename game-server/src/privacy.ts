// The public privacy notice, served as plain text at /privacy (round 22, addendum 2). Keep it true: it describes what the code does (src/net.ts in the halo, src/server.ts, src/memory.ts, src/retention.ts).
export const PRIVACY_NOTICE = `EMANATE: PRIVACY NOTICE (halo and game server)
Operator: Hidden Forces. Last updated: 2026-11-17.

What this is: Emanate Halo is a Decentraland smart wearable for the game Emanate. While it runs, it talks to one game server we run, emanate.hiddenforces.net, over HTTPS. It asks one permission, "Use the Fetch API". It does not ask for a signature, move funds, or open links.

WHAT LEAVES YOUR COMPUTER
Up to four times a second while the halo is running and can reach the server, the halo sends:
  - your wallet address,
  - your Decentraland display name,
  - your position in the world (x, y, z) and the position as the scene sees it,
  - your speed and your current power tier,
  - the side you chose in the game (hunters or helpers),
  - game events (for example "placed a plume", "pressed a key") and short diagnostic messages.
  - the halo's version numbers (its build id, its protocol version and the version of the settings it holds), so the server can tell which halo you run.
The server may switch the halo off at any time ("idle"): while idle it sends nothing about you; it only asks, with no personal field, whether to wake up.
Nothing else: no keystrokes outside the game's own keys, no data about other avatars, no files, no wallet signing.

WHAT THE SYNTH'S COMPUTER SEES
The Synth is an ordinary Decentraland avatar, so its client sees what any avatar nearby sees: other avatars' addresses, names and positions, and public nearby chat. On the computer that runs it, the client's own log holds that for the time it runs; the log is emptied every day and whenever the Synth is restarted, and it is never uploaded. The bridge's logs there hold only counts and the Synth's own position. Our test logs hold only throwaway test accounts.

WHERE IT GOES, AND WHERE IT IS HANDLED
Only to our server at emanate.hiddenforces.net (a rented virtual server). It is not sent to Decentraland and not shared with anyone else. The game character, the Synth, runs as a Decentraland client on a computer we operate, which talks to the server through a link we run (the "bridge"); that computer therefore also handles what the Synth sees (see below).

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
