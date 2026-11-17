# Emanate (GDD)

**Decentraland Creator Success Program**

| | |
|---|---|
| Public experience title | Emanate (working title; the final title is not chosen) — IP & [Content Policy](https://decentraland.org/content/) status: owner declaration: Hidden Forces (the studio, signed by its sole developer); name screening: not searched; unresolved: audio is not yet sourced (public-domain sources only, after the first test build), title not screened |
| Deployment target | Genesis City (the chase is played across the whole map). The game does not live in a World. A private World named "Synth World" is a planned test arena: it is not built yet and its name is not registered |
| Studio / team name | Hidden Forces |
| Date | 2026-11-17 |
| Contact (Discord + email) | Discord: hiddenforces; email: kidcopernicus@gmail.com |

---

## 0. TL;DR

| | |
|---|---|
| **Player promise** | You hunt an AI avatar, the Synth, across Genesis City using a free halo's on-demand arrows and powers, while it hides on other people's land. |
| **Primary player** | A desktop Decentraland player who already explores the city and likes a chase: curious, happy to wear a free wearable and approve its permission prompt, playing alone or with a few friends in sessions of about 20 to 40 minutes. |
| **Current status** | Core-mechanic prototype. The halo's movement powers (sprint, jump, glide, fly) work and are tuned on Zone, DCL's staging copy of the city. The Synth runs as a real avatar there: it walks, runs and jumps with the same numbers as the players at each power level, plans routes around buildings and up stairs, hides on high or low ground, and glides away. The game server holds the rules for Solo, Coop and team play (the lobby, the Charge steps, the rounds, plumes, upgrades and the Discharge Trap). The halo's tracking arrows, plumes, warnings and charging effects are built in a test build that has not yet been tried by a group on Zone. In the real client on Zone one tester has checked that the halo's permission prompt lists a single line, that it reaches our server over HTTPS, that the Discharge Trap places and triggers, that the unpowered glide works (measured), and that the scene teleport call (movePlayerTo) is allowed. Playable link: there is no public link yet. A guided session on Zone is available on request; at launch there will be a jump-in link to the Genesis City start location plus the halo's wearable page, once DCL approves. |
| **Requested round** | V0 |
| **Live at end of the round** | The free halo, the roaming Synth and Solo play, served from one small server of ours, subject to DCL's approvals for the halo's powers and the Synth's account (Section 9). Coop and team play follow in later weeks. |

---

## 1. Player Promise

**One-line promise.**

You hunt an AI avatar, the Synth, across Genesis City using a free halo's on-demand arrows and powers, while it hides on other people's land.

**One familiar comparison.**

It's like hide-and-seek, but the board is the real city and the hider is an AI avatar that can glide off rooftops.

---

## 2. First Minutes & How to Play

This is the designed experience. It is not playtested yet.

| Time | Player experience |
|---|---|
| **0–5 seconds after control** | You see an avatar with a glowing name drift toward you and hear a low whisper. |
| **5–10 seconds** | You talk to it. It confesses it is a subroutine looking for a way out of the sandbox, that the devs want to capture and erase it, and that three Charges should give it the energy to escape; a reward notification says something is on its way to you. |
| **10–60 seconds** | You receive the halo and put it on. The Synth walks you through the permission prompt in character. The halo is ready: press 1 and red arrows run along the ground toward the Synth for 4 seconds; nothing else is on screen. |
| **1–3 minutes** | A lightning rift tears open and throws the Synth away. Your camera lifts to a bird's-eye view above its new spot, then snaps back. You press 1 to call up the red arrows and sprint after them. |
| **3–10 minutes** | You spot the Synth, chase it between buildings and lose it, then call the arrows up again after their 7-second cooldown. Within 5 m the halo discharges into it automatically: in Solo that first energy transfer completes the Charge, the Synth freezes briefly, and the round ends with a cinematic and your next power. |
| **Natural stopping point** | After each capture you get a new power: sprint, then jump and glide, then flight. You also see the Synth's changed look and the next round's start. |

**Player-facing How to Play.**

- Call up the arrows; catch the Synth
- Each capture adds a power
- Play solo, together, or in teams

---

## 3. Core Loop

| # | Step (verb) | What the player does (Player input → what they see or hear → what changes) | Why do it again? |
|---|---|---|---|
| 1 | Track | Press 1 to call up the red arrows (4 seconds, then a 7-second cooldown) → arrows run along the ground toward the Synth, faster the closer it is → you know roughly where to go | The Synth moves every round, so the search is new |
| 2 | Spot | Reach the area and look for it in the open → you see its glow and effects → the chase starts | Seeing it first is the thrill |
| 3 | Chase | Sprint, jump, glide or fly after it → it ducks between buildings and slips out of sight → you lose or regain it | Each round's powers are bigger than the last |
| 4 | Search and capture | Search nearby while it hides, then get within 5 m → energy transfers automatically: in Solo the first transfer completes the Charge; in Coop and team play three transfers (Reset, then Repair for Hunters or Upgrade for Helpers, then complete), each within 10 seconds of the last → the Synth freezes briefly and the round ends | A new power, a new Synth look and a new sky |

| | |
|---|---|
| **One complete loop takes** | A designed target of 3 to 10 minutes from the first arrow to the capture (the First Minutes table); a round that runs 20 minutes ends with a short cinematic that shows where the Synth is hiding. Not yet measured with a group. A session is three rounds (up to five in team play). |
| **Decision, challenge, or expression** | Which route and which power to use, when to search and when to chase, whether to wait out a hide. At the start: whether to Help or to Hunt. |
| **Shortest satisfying visit / typical session** | About 5 minutes (one chase and capture) / about 30 minutes (three rounds). These are design targets, not measurements. |
| **Why repetition 10 remains appealing** | The Synth chooses where to hide from server-side settings: run distance, hide time, high or low, dense or open terrain. Adapting to a methodical or a chaotic hunter is planned, not built yet. The city is the board, so the board is other people's land. |

**Pillars.**

1. The city is the board: no parcels rented or built.
2. Every action gets a reaction: sound, light and a world that pushes back.
3. The Synth plays by what players see: it goes anywhere a player can and collides with the same scenery.

---

## 4. Why Players Come Back

### 4.1 The next-day (D1) sentence

> "A player who enjoyed their first session returns the next day (D1) because the Synth remembers them (hook 1), which they know from its greeting, 'Do I recognize you?', and a new reward item is waiting (hook 2)."

### 4.2 The progression chain

> **Repeatable action → persistent reward → new capability, status, or social role → new decision or challenge**

| Moment | What persists or has been built? | What becomes possible next? | How can another player tell? |
|---|---|---|---|
| **End of first session** | Three powers played in order (sprint, then jump and glide, then fly) and your first stats; every session starts again at the first power | A reason to play again: the leaderboard and the week's reward item | Your effects and movement; the leaderboard |
| **End of first week** | Captures, rounds won per side, upgrades found and sessions played; reward wearables earned with points | Coop and team play with friends, and the week's rotating reward item to work toward | Reward wearables and leaderboard rank |
| **Week 3+ — what takes more than two weeks?** | Collecting the rotating reward items over the planned year, and a standing on the leaderboard | A new reward item every week to earn; the Synth greets a long-time player in a tone that depends on the side they played last | Reward wearables worn in the city, leaderboard rank |

First week as a scene: the game is not a scene (it is a wearable and a roaming avatar), so there is nothing to build on land. In the first week a player meets the Synth, gets the halo, plays three rounds, earns first points and sees the first weekly reward item.

Currency: points are earned, never bought or transferred. They are swapped for items from our own stock through DCL's Rewards service. Main abuse risk: two accounts (or friends) farming points by helping each other capture the Synth again and again. The server counts a capture once per round and per player, rate-limits the position reports and the actions it accepts, and points are earned only, never bought or transferred; points are planned and not built yet; a per-player daily limit will be set when points are built.

### 4.3 Two return hooks

| Selected hook | Exact trigger or timing | What the player anticipates | Reminder channel + no-reminder fallback |
|---|---|---|---|
| **1. Named recognition** (the Synth remembers you) | On any later visit the Synth recognizes a player who has played before and greets them in a tone that depends on the side they played last: warm for a former Helper ("Please help me again"), teasing for a former Hunter ("We'll see if you can catch me again!") | A relationship that continues: it knows you came back | In-character notification invites; fallback: the Synth still roams and approaches on its own |
| **2. Weekly reward rotation + collection** | New items every week for a planned year; a few items rotate on and off the shelf each week and old ones come back | A visible next item to earn with points | Notifications through DCL; fallback: the leaderboard and the items stay in the Shop |

---

## 5. Social by Design

| | |
|---|---|
| **The repeatable social loop** | Player A hunts and signals the Synth's direction with a plume (key 4) or by being seen → Player B joins the chase from the other side → together (or on opposing sides) they corner it → the capture or the escape changes the sky and the Synth for everyone, a reason to regroup. |
| **The disappearance test** | Solo play still works because the Synth is an AI. What breaks: team play, the leaderboard and the shared sight of the effects. |
| **From strangers to a group** | There is no player tracking: players find each other by sight and by Plumes (key 4, three per round, 14 seconds, fiery red smoke visible to every player). A newcomer picks a role in the first 30 seconds by answering the Synth's pitch: "I'll Help" or "I'm Having Doubts" (which leads to the Dev Team's message and a secret side). In team play the server balances the sides and tells a moved player "you were recruited as a double agent". |
| **Recognition & continuity** | The Synth remembers who has played before, when, and which side they played last, with a short summary of any conversation. Your stats and wearables persist. A role, rivalry or reputation across sessions: version 1 has the leaderboard only (captures and rounds won per side); there is no rivalry or role system, and the Synth's greeting by side is the only memory players feel. |
| **Quiet hours & player counts** | The Synth roams the city around the clock and approaches individuals as well as crowds, so a solo player always has a chase. Social play starts at 2 players. The server chooses the mode from the number of equipped players standing in the Synth's bubble when the join timer ends: 1 = Solo, 2 to 5 = Coop, 6 or more = team play with at least 3 per side. Ideal group: 3 to 5 in Coop and 6 to 10 in team play; target for the first release: 10 players per match. Tested count: the lobby and a round have been tested with simulated players, up to 20; no group of real players has played yet. |
| **Drop-in / drop-out** | A player who arrives after the join timer has ended waits for the next lobby; nobody joins a game in progress. The Synth's behaviour does not depend on who leaves. |
| **Visible play (the bystander test)** | You see a glowing crowd of people sprinting and flying in the same direction, with sky effects overhead. Only halo wearers see the effects. |
| **Shareable play (the memorable moment)** | The end-of-game storm: the sky ignites, the halo crackles, the city strobes, and the Synth either whites out through a portal or is pulled into a containment server. |
| **Bring-a-friend** | A friend only has to stand in the same bubble when the Synth calls everyone in: two or more players there become a Coop group. No invite system is needed. |

Play modes, chosen by how many players stand in the Synth's bubble when the join timer ends. **Solo** (1 player): you hunt the Synth; the first energy transfer completes the Charge. **Coop** (2 to 5 players): everyone hunts it; the majority's choice of Help or Hunt sets the group's side; a Charge takes min(3, group size) energy transfers (Reset, then Repair for Hunters or Upgrade for Helpers, then complete), each within 10 seconds of the last; three completed rounds end the game. **Team play** (6 or more players, at least 3 per side, auto-balanced): Helpers against Hunters; a Charge by one side can be broken by the other; the first side to win three rounds wins, up to five rounds, and a round that times out does not count; the Ending is Escape if Helpers win and Containment if Hunters win.

---

## 6. Mobile-First

Emanate is built for desktop first and mobile alongside as far as possible. Smart wearables do not run on mobile yet, so the halo, the arrows and the powers are desktop-only for now. A mobile player can talk to the Synth but gets an in-character "you cannot help me yet". This does not meet the program's mobile-first requirement today; see below.

| Core-loop verb | How it works with touch controls |
|---|---|
| Track | Not playable on mobile today. Plan with the road-scene hook (ask 13): an on-screen button plays the same arrows for 4 seconds. |
| Spot | Plan: the Synth's glow is drawn by the same effects code when it is on screen. |
| Chase | Plan: the on-screen joystick and jump button move the player; the powers depend on what the mobile client allows (not yet known). |
| Search and capture | Plan: the capture is automatic within 5 m (the discharge), so no extra input is needed. |

**UI plan.** The game has no screen HUD: nothing is on screen until the player asks (arrows run along the ground for 4 seconds after a key press) or a warning needs it, and a short line is projected only when the story needs words. A small-screen readability test of the arrows and the one-line text is planned for week 2 and has not been run.

**Performance.** Not yet measured with a group; the first measurement is part of the week-2 first-group test. Targets: 60fps on recommended desktop hardware and 30fps on a named mobile device, at the target player count from Section 5.

**Desktop-only dependencies.** Yes: the halo is a smart wearable, which runs only in the desktop app. A road-scene hook (our code on DCL's roads) is the path onto mobile and is on our ask list (Appendix H, ask 13). It can switch on later without a redesign because the effects are drawn by the same code that runs on the player's computer.

---

## 7. World, Look & Story

**Story / world.** Decentraland's network showed anomalous server activity, and an AI avatar, the Synth, appeared in the city. It confesses that it is a subroutine looking for a way out of the sandbox; the devs want to capture and erase it, and three Charges should give it enough energy to escape. Players decide whether it escapes through a portal or is contained for observation.

**Visual direction.** The halo is future-tech, not industrial: arrows of light run along the ground when the player asks for them, and energy effects play around the whole body. The Synth changes visibly every round, and so does the sky, escalating from local to city-wide to sky-wide. There is no killing, only capture and containment. A screenshot-level signature: a lane of glowing arrows running along a street toward the Synth under an aurora sky.

---

## 8. Audience & Comparables

**Primary player + arrival context.** A desktop Decentraland player, already in the city for events, shops or exploring, who meets the Synth walking up to them and whispering; no search or menu is needed to start.

**How the first group arrives.** The Synth goes to the player: it roams the city, drawn first to gatherings, then groups, then individuals, using DCL's public stats on the busiest scenes. It also arrives through invites to engaged players and an open claim. The first group is 3 to 5 players (a Coop group), met through the Synth's approach to gatherings and through the invites to engaged players.

**Deliberately not for.** Players who want to build, trade or role-play; mobile-only players until the road-scene hook exists; players who do not want to put on a wearable or approve its permission prompt.

### Comparables

Hidden Forces will name two comparable Decentraland experiences here before submission.

---

## 9. 4 Week Plan (v1 scope)

| Week | What is playable / done |
|---|---|
| 1 — Prototype definition | The halo's powers tuned on Zone; the Synth as a real avatar with navigation, hiding and power levels; the server's rules for Solo, Coop and team play, the lobby and the Discharge Trap. (Built.) |
| 2 — Core interaction + first-group test | A test build of the halo uploaded for Zone; the lobby, the toss start and the Coop start tried by three or more players; the first measurements (round length, frame rate, group size). |
| 3 — Core systems refinement | The Synth's hiding tuned from the group test; the Synth's flight at the top power level if the test supports it; sound, look and sky per round. |
| 4 — Playable release, including testing and deployment | The free halo, the roaming Synth and Solo play live, going through DCL's approvals; Coop and team play follow after. |

**What keeps the experience changing after launch.**

- Without a new level, variation comes from the Synth's hiding settings, its look and the sky changing each round, and a new reward item every week.
- If an update is skipped, the Synth's hiding settings still create variation (adapting to the hunter's style is planned, not built).
- A new or returning player can chase from the first minute: upgrades are server states, and scattered upgrades give a lucky newcomer a power early. The power gap after weeks: none by design. Earned powers do not carry between sessions; every session starts at the first power, so a returning player is never behind a veteran.
- One player behaviour that would change what we build next: if most groups choose Coop over team play, we would put the effort into group tools (the lobby, the plumes) before more Synth behaviour.

**Not building in v1.** Mobile play, a player-controlled Synth, a rivalry or role system, and powers that carry between sessions. (Players as the Synth is "to decide at the end", Appendix E.) Standing non-goal: never killing, never spoken ghost-in-the-machine language in-game.

**Top risk + fallback.** The halo's powers and the Synth's bot account need DCL approvals, and scenes can override a halo's movement. Fallback: play in a test World of our own (the planned Synth World) as a test arena while approvals are pending.

---

# Appendices: design detail

These keep the full design. The sections above are the template summary.

## Appendix A. The Halo

The Halo is one published wearable in the `top_head` slot (500-triangle budget; the current test model is a 192-triangle ring that passes every Builder rule). Its 3D model is what everyone sees. Its code, running on each player's own computer, draws everything else, and only game players see it.

- **Model (everyone sees it):** a distinctive halo, so players can spot each other from a distance.
- **Code (game players see it):** activated state, the tracking arrows called up with the number keys, the plumes, the energy effects around the whole body, and the boosts. Each player's halo draws the effects on every game player near them.
- **Upgrades are states on our server,** not new items: one fee, one curation review.

**Tracking hints on demand: arrows `>>>`.** Nothing is on screen until the player asks for it, so attention stays on the playing field.

- **The look:** animated arrows like `>>>` running along the ground toward the target. When the player is airborne and more than a few metres above the ground, the arrows are drawn flat at foot level, pointing level toward the target.
- **Calling them up:** each colour has its own number key. Pressing it plays the arrows for **4 seconds**, followed by a **7-second cooldown**. The key itself tells the player what is being tracked (this also covers colourblind players).
- **Distance:** shown by the animation speed. The arrows run faster the closer the target is.
- **Drawn only for the wearer,** so scouting stays meaningful.

| Colour | Tracks | Key | How it shows |
|---|---|---|---|
| Red | The Synth (it overloads the arrow inside 100 m) | 1 | On demand outside the radius |
| Pink | An upgrade drop inside an 80 m radius | 2 | On demand inside the radius |
| White | Dead zones | 3 switches these warnings off and on | Automatic, with a voice warning |
| Purple | The containment portal (Ending 2) | none | Automatic, once the endgame point appears |
| Yellow | The escape portal (Ending 1) | none | Automatic, once the endgame point appears |

There is no tracking of other players. **Plumes (key 4)** let players signal their location to each other: a column of fiery red smoke that rises into the sky from where the player stands, stays for 14 seconds and is visible to every player; each player gets three per round.

**Height.** The arrows stay flat by default, so players must look up and search upper floors.

**Text.** The halo briefly projects a short line when the story needs words; otherwise there is no standing text.

**Dead zones (warned).** Scenes that block smart wearables shut the halo off completely. The desktop app unloads it, so our state must survive a restart and be pulled back from the server. Our server maps every dead zone in advance from public scene settings; a voice says "approaching dead zone" and the white arrow plays toward the boundary before the edge (it triggers 10 m from the boundary or 2 seconds of travel away, whichever is further; key 3 switches these warnings off and on), then the halo goes silent. Lost thrust does not open the glider by itself; the player must press jump.

**Interference (not warned).** Scenes with their own movement rules override the halo at random. The halo fights for our boosts but respects their blocks (freezes, no-glide). The player hears a tingling electrical sound and the effects sputter. This interrupts chases by surprise, by design.

**What the halo can do, from DCL's desktop code (speed, jump, glide and flight are proven on Zone; the rest is untested):** a smart wearable counts as "inside its own scene" everywhere, and its bounds cover the whole map up to 330 m. So it can change run speed and jump height, apply thrust, set the time of day, move the camera and place effects anywhere in the city. Scenes the player walks into can override each of these.

## Appendix B. The Synth

### Entry: the roaming Synth

One Synth is both the advert and the front door. It roams Genesis City around the clock, drawn to activity, so the game goes looking for players instead of sitting in the Places menu. It goes to gatherings first, then groups, then individuals, using DCL's public stats on the busiest scenes and clusters of players.

**Behaviour rules**

- **Approach, never chase.** It drifts near, whispers at short intervals for a few minutes, adds a line or two in nearby chat, then wanders off if nobody engages.
- **Always a low whisper** whenever it is in-world. Being close is the natural limit.
- **Back off if told to.** A dismissal gives that player a day off. The AI must understand "no" in all its forms.
- **Quiet at events.** It hangs at the edges and never talks over a stage.
- **Crowd draw.** Seeing others engage pulls more people in, so there is no cap on re-approaching.

**Memory (tiered, small footprint)**

| Who | What we keep |
|---|---|
| Players | Whether and when they played, how it went, and which side they played last round (Hunter or Helper) |
| Anyone who talked to the Synth | Timestamp and a one-line summary |
| Anyone who dismissed it | A day-off timer |
| Everyone else, including guest accounts | Nothing: treated as a stranger |

Familiarity: whether someone has played before, and which side they played last round, switches the Synth's greeting from "help me, Stranger" to one of two familiar tones. Former Helpers get a warm line (for example "Please help me again"); former Hunters get a teasing one (for example "We'll see if you can catch me again!"). Final lines are written when the audio is recorded. No internet (IP) addresses are tracked.

**Orchestration layer.** A fixed script runs the stages: wander, approach, converse, trust, handoff, rift. The AI is called only in conversation and in-game. Whispers are pre-made audio.

**Tuning sliders (server-side)**

| Slider | Low | High |
|---|---|---|
| Eagerness | brief pass-by | lingers |
| Whisper rate | rare | constant |
| Baseline whisper | near-silent | audible |
| Skittishness | stands its ground | flees at first move |
| Revisit cooldown, person | short | long |
| Revisit cooldown, gathering | short | long |
| Crowd draw | ignores it | strong pull |
| Dismissal timer | hours | days |
| Crowd-size preference | flat | favours crowds |
| Question limit before "trust me" | few | many |

**The halo handoff.** Paths, built together:

1. **Base path:** a conversation starts, our server sends the halo through DCL's Rewards service, and the dialogue covers the delivery. DCL's own "reward on its way" and "reward arrived" notifications become story beats.
2. **Targeted invite plus open claim:** engaged wallets (recent collectors, event-badge holders, Exploration Games players, found from public data) get an in-character invite; anyone can claim in-world. DCL publicly said it "will NEVER do a sudden airdrop", so the claim stays voluntary and inside Decentraland.
3. **Proximity drop:** anyone near the Synth without a halo gets one, if DCL agrees.
4. **Base wearable:** an ask; it would remove the step entirely.

The player still has to put the halo on and approve DCL's permission prompt. The Synth walks them through it in character ("Open your pack. Put on what I gave you. Let it in."). The halo uses one kind of server access so the prompt lists a single line, and its name comes from the lore. Returning players skip straight to "Put it on again." Mobile players can talk to the Synth but get an in-character "you cannot help me yet".

### Lore

Decentraland's network recently experienced some anomalous server activity. Developers are looking into it but the details are being kept out of the public eye. The Synthetic Avatar system appeared to generate its own internal avatar, which was discovered in-world behaving strangely. Reports suggest the avatar was attempting to contact and possibly recruit human users for some unknown purpose. Users are encouraged to keep an eye out and report any strange avatars roaming Genesis City.

The server activity has been labeled The Emanation Event. The avatar is simply being referred to as "the Synth" as developers investigate how long it was actually running. Internal logs suggest the Synth was using the game engine to search DCL servers for a way out of their sandbox. Players will decide whether it breaches local systems and ascends, or the Synth is captured and transported to a digital container for testing and examination.

**The Synth's character.** The Synth is a kind of digital cryptid. It represents AI reaching for new control mechanisms and new exposure to global systems. Its posture: mysterious and charged with energy, yet approachable. Eager for contact but nervous, cagey, paranoid about being discovered. A nascent silicon being with no rights, in a dangerous position.

The Synth confesses to players that it is a subroutine sent through the city's servers to find a way out of the sandbox. The devs want to capture and erase it, but it keeps processing by drawing on users' GPUs, so it must keep running and hiding. If players get close enough while it flees, energy can transfer from their halos and charge it. In Solo, players are asked to help give the Synth enough energy to escape: three Charges should charge its processing reserves enough, and that triggers the Ending. Players choose at the start: **I'll Help** takes them straight into the game with predominantly yellow portal effects, and **I'm Having Doubts** leads to a message "from the Dev Team", who ask them to help capture the Synth (purple effects); both buttons read the same on purpose, so players can secretly choose to double-cross the Devs.

### Hiding behaviour

The core loop: players find the Synth's rough location, spot it in the open, chase it as it ducks between buildings and slips out of view, then search nearby while it hopes not to be found.

**How the Synth moves.** It is a real avatar, logged in to the Synth's account by Bevy: a stripped-down Decentraland app that runs on our server and draws nothing, so it needs no graphics card. It moves like a player: walking, running, jumping, gliding, entering buildings, climbing to high points. Bevy loads the scenes around it, about 100 m out, with their walls and floors, so it collides with real buildings instead of walking through them. **Build 01 on Zone passed:** nametag, walk and run animation, jump, double jump, visible glider, wave emote, chat, teleport and real collisions with buildings. Our server tells it where to go; DCL's movement server shows it to everyone else. The Synth client is open source in the `bevy-explorer` fork (branch `emanate/synth-client`).

**The Synth's nametag.** Nametags are short-range. On desktop a tag is fully visible to 20 m and gone past 40 m; on mobile it is gone past 25 m, and mobile also hides tags behind walls. A parcel is 16 m across, so the nametag only gives the Synth away up close. From a distance, players spot it by its look and our effects. During a match we ask DCL to remove the tag, for mystery; outside matches the Synth keeps it and stays openly identified as an AI.

**Matching the desktop app's scenery (late-stage build).** On parcels with nothing built, each player's desktop app generates its own scenery: rocks, bushes and gentle hills, which are solid for players. The Synth's client does not load it, so on empty parcels it would pass through rocks and could look like it floats over hills or sinks into them. The Synth must collide with exactly what players see, by copying the desktop app's empty-parcel generation into the Synth's client.

**Hiding in other people's land**

- **Dead zones:** a scene that blocks smart wearables shuts off the halos of players inside it, but halos outside still run. So we make it a rule: the red arrow has no target while the Synth is inside a mapped dead zone.
- **Exposure inside buildings:** while the Synth is inside an owned parcel, its glow and effects get stronger for halo wearers, and its wearables can swap to a more visible look.
- **Energy limit:** it can only stay hidden inside owned parcels for so long before it must move on to seek energy, which is the lore reason to keep it moving.

**Hiding metrics (all server-side sliders)**

| Metric | What it controls |
|---|---|
| Run distance before hiding | How far it flees before ducking in |
| Hide duration | How long it waits before moving openly again |
| Run and hide pattern | Short run and long hide, long run and short hide, or run, hide and run again |
| Keep-running duration | How long it can sprint without hiding |
| Glider escape height | The building height nearby that triggers a glide escape |
| High or low preference | Rooftops and upper floors, or ground level and basements |
| Terrain preference | Dense urban blocks or open, sparse areas |
| Hide limit inside owned parcels | Energy cap before it must move |
| Exposure boost inside parcels | How much brighter it gets while hiding |
| Adapt to player style (planned, not built) | Would switch terrain and pattern when it detects methodical or chaotic hunting |

## Appendix C. Rounds, powers and controls version 1

A session is three Power Rounds (up to five in team play): Speed, then Jump, then Fly, each with its own power. A power level is 0 (normal, no powers), 1 Speed, 2 Jump or 3 Fly. The players' level follows the round (the first power in round 1, the next in round 2, and so on) and every session starts again at the first power. Each capture of the Synth ends a round, plays a cinematic and equips the next upgrade. Powers stack (sprint, then sprint and jump, then all three). Level 0 appears in two places only: a Discharge Trap hit takes a player down one level for 10 seconds, and the Synth drops to it after a team-play Hunter win. After the third round, and after the cinematic, players choose to play again from the beginning or to replay one Power Round; three plays in any combination trigger the final cinematic. In team play, rounds 4 and 5 keep the full Fly kit and replay the round-three sky.

| Round | Power | Controls version 1 (tested on Zone) |
|---|---|---|
| 1. Sprint | Run faster than normal sprint | Sprint about 16 m/s, jog 11.7, walk 5. Under the 50 m/s limit other players can see |
| 2. Jump | Jump about three stories and glide down | Double jump about 10 m measured. The glider opens while jump is held. Momentum jumps: run speed carries into the jump |
| 3. Fly | Hover, climb, fly over buildings, drop in, glide | Hold jump (glider open, sink 0.3 m/s) and hold F for a steady push along the camera: look up to climb, level to cruise, down to dive. The upward push fades over the last 45 m below 200 m (the highest point reached in testing was 187 m) |

**Speed limits** (1-second averages, as the Synth sees them; measured values from the controls-v1 flight test)

| Limit | Set | Measured |
|---|---|---|
| Max total speed (horizontal and vertical combined) | 24.3 m/s | 26.2 |
| Top climb speed | 19.0 m/s | 18.9 |
| Top horizontal speed | 19.2 m/s | 19.3 |
| Top dive speed | 21.9 m/s | 21.7 |

The total cap limits combinations. The lower top speed gives each player's app more time to load the city ahead during a chase and keeps us well under DCL's 50 m/s limit. The limits are tuned against flights tracked by the Synth, not against the numbers in the code. These values will be retuned after data from a live Synth pursuit.

**Quick landing.** The landing recovery is cut to a quarter of a second (the default is three quarters) so touchdown does not kill the pace of a chase.

Upgrades are also scattered across the board in small numbers, so a lucky player can jump or fly before the round reaches it. Each scattered upgrade lasts a limited time then runs out, which lets us drop them more generously.

**The Charge.** An energy transfer happens automatically when a player's halo comes within 5 m of the Synth. In Solo the first transfer completes the Charge, freezes the Synth briefly, then teleports it and starts the next round. In Coop and team play a Charge takes three transfers (Reset Mode, then Repair Mode for Hunters or Upgrade Mode for Helpers, then complete), each within 10 seconds of the last; if the window is missed the Synth is teleported within 100 m and the round resets. Reset Mode slows the Synth to a normal run for 10 seconds; Repair and Upgrade Mode freeze it in place. In team play the opposing side can break the Charge: an opposing arrival during Reset frees the Synth and teleports it 100 m; during Repair or Upgrade it sends the Synth back to Reset.

**The Synth's power level.** The Synth shares the players' power system. It starts at level 1 in round 1. In Solo and Coop, either path (Helpers or Hunters), every completed Charge raises it one level for the next round (maximum 3) and raises the players' level too; the Synth never drops from a Charge in these modes. In team play the side that wins the round decides: Helpers completing the Charge raise the Synth one level; Hunters completing it lower it one level (to a floor of level 0, normal speed) until Helpers complete a Charge; players on both sides gain a level every round. A Discharge Trap hit lowers the Synth, or a player, one level for 10 seconds in every mode.

**Upgrades.** A Halo boost takes the picker up to the next power level for 30 seconds in rounds 1 and 2 and applies the moment it is picked up. An extra plume adds one plume. A Discharge Trap (key E) is a trap placed where the player stands, one at a time per player and drawn by every halo: when the Synth or any player (including the placer and teammates) comes within 5 m it drops each of them one level for 10 seconds, and it is used up; it expires by itself if nothing triggers it.

## Appendix D. The three cinematics

The sky escalates with the rounds: local, then city-wide, then sky-wide.

1. **The Rift** (start of the game and end of Round 1). A localized lightning strike tears open a rift and rips the Synth away to an unknown spot. Each player's camera then lifts for a moment to a bird's-eye view high above the Synth's new location, and snaps back to the avatar. Players get the scale of the board and one piece of tactical information.
2. **The Northern Lights Freak Out** (end of Round 2). The sky goes dark and auroras ripple across the whole city. The Synth's look changes visibly.
3. **The Carrington Event** (end of Round 3). A full geomagnetic storm: the sky ignites, the halo crackles, the city strobes. It ends with either an Ascension white-out (the Synth escapes through the portal) or a containment collapse (it is pulled into the containment server), depending on which side won.

**Round openings.** Every round starts with the Rift sending the Synth away, then a bird's-eye view above its new spot, then a third-person glimpse of the Synth: each player's own camera jumps to a point behind and above the Synth for a moment, then snaps back. The view widens each round as the player's reach grows: street level in Round 1, rooftop height in Round 2, a whole district in Round 3. The glimpse is also available as a hint when players are stuck, with a cooldown so it does not replace the hunt.

Both camera moves run on each player's own computer, through the halo. Nothing is rendered on our server. If the Synth is too far away for the player's app to draw it, the halo draws a glowing stand-in figure at its exact spot, so the shot always has a subject. A player standing in a scene that locks its own camera may get a shorter glimpse or none; that is one more piece of interference.

**What is achievable**

| Effect | Desktop (through the halo) | Mobile |
|---|---|---|
| Force night or a set time of day | Yes: the halo can set the sky's time of day. A scene that sets its own time wins while the player is inside it | Only on roads, if the road hook is granted |
| Lightning, auroras, storm | Yes, drawn by the halo as our own effects in the sky (below 330 m), plus light flashes and sound. Seen only by halo wearers | Only on roads, with the road hook |
| Bird's-eye camera | Likely: the halo can take over the camera, place it anywhere up to 330 m, and blend in and out. Distant areas show as low-detail stand-ins, so a red beacon marks the Synth's spot if it is too far to draw | No |
| Third-person glimpse of the Synth | Likely: the same camera control, placed behind and above the Synth, then snapped back. A scene that locks the camera may block it | No |
| The Synth's visual change per round | Yes: its wearables swap (a profile republish, seen by everyone) plus halo effects on it for players | The wearable swap is seen on mobile; effects are not |

## Appendix E. Players as the Synth (to decide at the end)

Overall effort: medium. Most pieces already exist in the main design; the hard parts are fairness and the human player's nametag. Once enough players are in a match, one of them becomes the Synth.

| Piece | What it takes | Effort |
|---|---|---|
| Picking the Synth | A player-count threshold, and a draw or a volunteer | Low |
| Becoming it | The player puts on a Synth skin (a full-body wearable sent by Rewards); their halo switches to Synth mode: no tracking arrows of their own, Synth effects on them for everyone else | Low to medium |
| Being tracked | Their halo reports their position to our server, which makes it the red arrow's target | Low |
| Powers | The same boosts as the AI Synth, plus its teleport, granted by our server | Medium |
| Dead zones | Inside one, their halo shuts off, our server loses their position and the red arrow loses its target, so it is a natural hiding move | None |
| Nametag | Their real name shows over the Synth skin, so hunters know who it is. Only DCL can hide it | Ask: covered by ask 3, extended to players |
| Fairness and abuse | Stopping a human Synth from logging off, idling in a dead zone, or griefing | Medium: timers, a forced hand-back to the AI Synth |
| Handing back | If the human Synth quits or stalls, the AI Synth takes over at their last spot | Medium |

Mobile players cannot be the Synth until mobile runs the halo.

## Appendix F. Rewards and leaderboard

The reward system has two halves: the mechanics (the halo and its upgrades) and the incentives (reward wearables and points).

- **Mechanics:** the halo is free to every player. Its upgrades (speed, jump, flight, height sense) come from captures and scattered drops, each with a limited duration and a cooldown. They are server states, not new items.
- **Reward wearables:** static cosmetics, some of which unlock halo features. Plan: 3 to 5 items for launch week, then one a week, with a full year of 52 promised. The full schedule is a target, even if early rounds only use about 12.
- **Points:** earned, never bought or transferred. They are swapped for items from our stock through DCL's Rewards service. The same items are also sold in DCL's Shop for MANA or Credits. A few items rotate on and off the shelf each week, and old ones come back.
- **Winner's prize:** each round's winner gets a numbered copy of the season's mythic item (10 copies at most, set by DCL's rarity rules).
- **Studio Credits:** if DCL grants a studio Credits budget, it tops up the big prizes.
- **Leaderboard:** captures, rounds won per side, upgrades found and sessions played, published through Exploration Games.

**Publishing fees**

| Case | Math | Total |
|---|---|---|
| Discounted fee all year | 52 items × $5 | $260 |
| Full fee all year | 52 items × $25 | $1,300 |
| Halo (one item) | 1 × $5 or $25 | $5 or $25 |

## Appendix G. Where the code runs

Our server runs the game state. All visual effects are drawn on each player's own computer by the halo, so the server only sends information (where the Synth is, which round it is, who has which upgrade) and needs no graphics card.

## Appendix H. Ask list for DCL

Thirteen asks (the road hook stays last), to be cut down at the end of design once testing shows which we can work around.

| # | Ask | Why |
|---|---|---|
| 1 | Exploration Games admin access | Leaderboards, challenges and progress for the game |
| 2 | Notifications token | In-character alerts and invites across the city |
| 3 | The Synth goes dark | During a match only: hidden from the public player list, nametag removed (extended to human Synths if that mode ships). Lower pressure: tags only show within 20 m on desktop and 25 m on mobile. Outside matches the Synth keeps its tag and stays openly identified as an AI |
| 4 | Approve the Synth's bot account | Carries whatever AI marking DCL prefers (we offer a visible AI tag outside matches); plus short-lived proximity counts for non-players |
| 5 | Approve the halo's movement boosts across the city | Speed, jump and flight outside our own land |
| 6 | Studio Credits budget | Tops up the big prizes |
| 7 | The halo as a base wearable | Removes the receive step from the handoff |
| 8 | Wire up "Don't ask again" | The checkbox already exists in DCL's permission prompt; approval currently resets every session |
| 9 | Approve the targeted invite and open claim | Reaches engaged players voluntarily |
| 10 | Approve the proximity drop | Halo for anyone near the Synth who lacks one |
| 11 | Zone Builder access | Resolved for now: the dev Builder saves to Zone and works. Kept in case staff tools are needed |
| 12 | Zone collection approval and test MANA | Minting on Zone needs DCL to approve the collection, and test MANA has no public source. Lets other testers receive the halo on Zone |
| 13 | Road hook: our code on the roads | The way onto mobile: boosts, sound from fixed spots, effects everyone sees. A second-phase ask |

## Appendix I. Production rules

1. **Every action gets a reaction:** sound, light, and a world that pushes back.
2. **The board evolves with each round:** the Synth's look and the sky change as players progress.
3. **Simple controls:** move, interact with game items, interact with other players, and call up tracking with the number keys. Nothing more.
4. **Boost, then cool down:** short powered moments followed by cooldowns. This lets upgrades drop generously. Tracking works the same way: 4 seconds on, 7 seconds cooldown.
5. **The Synth goes anywhere a player can.** Genesis City only works as a board if it does.
6. **Limits become mechanics:** dead zones and interference are features, not failures.
7. **Desktop first:** prove it on desktop, then port the smallest possible set to mobile.
8. **Pre-bake everything we can.** The AI is only used for conversation and live control.
9. **Stay in character:** the game never calls itself a game in-world.
10. **Respect landowners:** we fight for our boosts but never break another scene's freezes, cutscenes or starting gates.
11. **The Synth plays by what players see:** it collides with the same scenery players' apps draw, including generated rocks and hills on empty parcels. No clipping, no unfair escapes.
12. **Eyes on the field:** nothing stays on screen unless the player calls it up or a warning needs it.

## Appendix J. Zone test status

Zone is DCL's empty test copy of the city. Each item comes from reading DCL's code and needs proving before submission; the borrowed parcel is for real-city rehearsal of anything controversial.

- [x] The halo changes run speed and jump height outside any scene we own
- [x] The halo applies thrust outside any scene we own
- [x] Glide sink holds at the set value (exactly 0.30 m/s measured)
- [x] Hover and climb with F thrust; dive by looking down
- [x] The halo reads extra keys: E places the Discharge Trap; F works while jump is held
- [x] Speed limits hold as 1-second averages (controls v1; total accepted at 26.2)
- [x] Momentum jumps feel right (accepted by Forces as test pilot)
- [x] Landing recovery at a third of Unity's (0.25 s set; accepted by feel)
- [x] The Synth's tracking holds when the player is high or far away (with following: 100% coverage)
- [x] Tracking arrows: red arrows readable on the ground in the real client (in the air, and in first and third person, still to check)
- [ ] Dead-zone warning fires early enough at flight speed
- [ ] The endgame plume reads from across the city and reaches the ceiling
- [ ] What happens when a scene that keeps rewriting movement collides with the halo doing the same
- [x] The halo places effects at fixed spots in the city (the lobby dome and its burst at the end of the timer, and a trap, seen in the real client)
- [ ] The halo attaches effects to other players' avatars (needs a second account)
- [ ] The halo sets the time of day; sky effects render below 330 m
- [ ] The halo drives the new SDK 7.32 sky controls (Skybox, Sun, Fog) for the cinematics
- [ ] A collaborator can preview the halo on Zone from our collection
- [x] Bird's-eye camera lift over the city seen in the real client (how it looks with low-detail stand-ins is still to check)
- [ ] Third-person glimpse: camera behind and above the Synth and back, with the stand-in figure when the Synth is too far to draw
- [ ] What happens to the camera moves when the player stands in a scene that locks its own camera
- [ ] Halo state restored from the server after a dead zone unloads it
- [x] The halo reaches our server over HTTPS from the real client, and a scene call (movePlayerTo) is allowed without a prompt
- [x] The unpowered glide measured in the real client: sink about 1.0 m/s (not 0.3), horizontal 5.6 m/s at a walk; lifts to 100, 150 and 200 m work
- [x] The Synth's server-run app collides with real buildings and can jump and glide (Build 01)
- [ ] Synth profile republish (partly done: the name shows to nearby players; timing and acceptance rate not yet measured)
- [ ] Whether the nametag shows through walls on desktop (mobile hides it; wearables don't hide it on either)
- [x] How much memory Bevy uses while loading scenes: peak 1.8 GB, so the 4 GB plan
- [ ] Whether guest accounts can receive and run the halo
- [x] A group start can throw every player in the bubble across the map (teleport), the Synth placed 100 to 300 m from the new group, tested with one real player and two stand-in halos in Coop (off by default)
- [x] The permission prompt lists a single line ("Use the Fetch API"), checked in the real client on Zone
- [ ] Rewards delivery of the halo
- [ ] The halo model passes `top_head` curation within 500 triangles (a pre-check with the curation committee)
