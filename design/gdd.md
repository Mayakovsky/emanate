# Emanate (GDD)

**Decentraland Creator Success Program**

| | |
|---|---|
| Public experience title | Emanate (working title; the final title is not chosen) — IP & [Content Policy](https://decentraland.org/content/) status: owner declaration: `TBD:`; name screening: not searched; unresolved: audio is not yet sourced (public-domain sources only, after the first test build), title not screened |
| Deployment target | Genesis City (the chase is played across the whole map). A private World is used only as a test arena: `TBD:` World NAME |
| Studio / team name | `TBD:` |
| Date | 2026-11-12 |
| Contact (Discord + email) | `TBD:` |

---

## 0. TL;DR

| | |
|---|---|
| **Player promise** | You hunt an AI avatar, the Synth, across Genesis City using a free halo's dots and powers, while it hides on other people's land. |
| **Primary player** | `TBD:` |
| **Current status** | Core-mechanic prototype. The halo's movement powers (sprint, jump, glide, fly) work and are tuned on Zone, DCL's staging copy of the city. The Synth runs as a real avatar there and collides with real buildings. Tracking dots and effects are not built yet. Playable link: `TBD:` |
| **Requested round** | V0 |
| **Live at end of the round** | `TBD:` |

---

## 1. Player Promise

**One-line promise.**

You hunt an AI avatar, the Synth, across Genesis City using a free halo's dots and powers, while it hides on other people's land.

**One familiar comparison.**

It's like hide-and-seek, but the board is the real city and the hider is an AI avatar that can glide off rooftops.

---

## 2. First Minutes & How to Play

This is the designed experience. It is not playtested yet.

| Time | Player experience |
|---|---|
| **0–5 seconds after control** | You see an avatar with a glowing name drift toward you and hear a low whisper. |
| **5–10 seconds** | You talk to it. It says it is stuck in a chase loop and needs help; a reward notification says something is on its way to you. |
| **10–60 seconds** | You receive the halo and put it on. The Synth walks you through the permission prompt in character. Small dots of light appear around your head. |
| **1–3 minutes** | A lightning rift tears open and throws the Synth away. Your camera lifts to a bird's-eye view above its new spot, then snaps back. You follow the red dot, sprinting. |
| **3–10 minutes** | You spot the Synth, chase it between buildings and lose it off the dots. You catch it, a discharge stops it, and the round ends with a cinematic and your next power. |
| **Natural stopping point** | After each capture you get a new power: sprint, then jump and glide, then flight. You also see the Synth's changed look and the next round's start. |

**Player-facing How to Play.**

- Follow the dots; catch the Synth
- Each capture adds a power
- Play solo, together, or in teams

---

## 3. Core Loop

| # | Step (verb) | What the player does (Player input → what they see or hear → what changes) | Why do it again? |
|---|---|---|---|
| 1 | Track | Turn your head or camera to read the dots → a red dot pulses toward the Synth; size and brightness show distance → you know roughly where to go | The Synth moves every round, so the search is new |
| 2 | Spot | Reach the area and look for it in the open → you see its glow and effects → the chase starts | Seeing it first is the thrill |
| 3 | Chase | Sprint, jump, glide or fly after it → it ducks between buildings and drops off the dots → you lose or regain it | Each round's powers are bigger than the last |
| 4 | Search and capture | Search nearby while it hides, then get close → a discharge between the halo and the Synth's field stops it → round ends | A new power, a new Synth look and a new sky |

| | |
|---|---|
| **One complete loop takes** | `TBD:` (not yet measured with a live Synth). A session is three rounds. |
| **Decision, challenge, or expression** | Which route and which power to use, when to search and when to chase, whether to wait out a hide. In the last round: Help or Hunt. |
| **Shortest satisfying visit / typical session** | `TBD:` / `TBD:` minutes |
| **Why repetition 10 remains appealing** | The Synth chooses where to hide from server-side settings: run distance, hide time, high or low, dense or open terrain. It adapts when it detects a methodical or a chaotic hunter. The city is the board, so the board is other people's land. |

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
| **End of first session** | Three powers unlocked in order (sprint, then jump and glide, then fly) and your first stats | A different way to cross the city in the next session | Your effects and movement; the leaderboard |
| **End of first week** | Captures, rounds won per side, upgrades found and sessions played; reward wearables earned with points | `TBD:` | Reward wearables and leaderboard rank |
| **Week 3+ — what takes more than two weeks?** | `TBD:` | `TBD:` | `TBD:` |

First week as a scene: `TBD:`

Currency: points are earned, never bought or transferred. They are swapped for items from our own stock through DCL's Rewards service. Main abuse risk: `TBD:`

### 4.3 Two return hooks

| Selected hook | Exact trigger or timing | What the player anticipates | Reminder channel + no-reminder fallback |
|---|---|---|---|
| **1. Named recognition** (the Synth remembers you) | On any later visit the Synth recognizes a player who has played before and greets them differently ("I need your help once again") | A relationship that continues: it knows you came back | In-character notification invites; fallback: the Synth still roams and approaches on its own |
| **2. Weekly reward rotation + collection** | New items every week for a planned year; a few items rotate on and off the shelf each week and old ones come back | A visible next item to earn with points | Notifications through DCL; fallback: the leaderboard and the items stay in the Shop |

---

## 5. Social by Design

| | |
|---|---|
| **The repeatable social loop** | Player A hunts and signals the Synth's direction through chat or by being seen → Player B joins the chase from the other side → together (or on opposing sides) they corner it → the capture or the escape changes the sky and the Synth for everyone, a reason to regroup. |
| **The disappearance test** | Solo play still works because the Synth is an AI. What breaks: team play, the leaderboard and the shared sight of the effects. |
| **From strangers to a group** | The halo's dots tell you the side of other players: yellow for your side, cyan for the other or not yet aligned. `TBD:` how a newcomer picks a role within 30 seconds. |
| **Recognition & continuity** | The Synth remembers who has played before and when, with a short summary of any conversation. Your stats and wearables persist. A role, rivalry or reputation across sessions: `TBD:` |
| **Quiet hours & player counts** | The Synth roams the city around the clock and approaches individuals as well as crowds, so a solo player always has a chase. Social play threshold, ideal group and target count: `TBD:` Tested count: not tested. |
| **Drop-in / drop-out** | Late arrivals get a halo from the Synth and join the hunt immediately; the Synth's behaviour does not depend on who leaves. |
| **Visible play (the bystander test)** | You see a glowing crowd of people sprinting and flying in the same direction, with sky effects overhead. Only halo wearers see the effects. |
| **Shareable play (the memorable moment)** | The end-of-game storm: the sky ignites, the halo crackles, the city strobes, and the Synth either whites out through a portal or is pulled into a containment server. |
| **Bring-a-friend** | `TBD:` |

Play modes: **Solo** — you hunt the Synth and, on the final round, choose Ascension (it reaches a portal of light) or Contained (it is captured). **Coop** — everyone hunts it and decides together. **Teams** — one side helps it reach the portal, the other captures it.

---

## 6. Mobile-First

Emanate is built for desktop first and mobile alongside as far as possible. Smart wearables do not run on mobile yet, so the halo, the dots and the powers are desktop-only for now. A mobile player can talk to the Synth but gets an in-character "you cannot help me yet". This does not meet the program's mobile-first requirement today; see below.

| Core-loop verb | How it works with touch controls |
|---|---|
| Track | `TBD:` |
| Spot | `TBD:` |
| Chase | `TBD:` |
| Search and capture | `TBD:` |

**UI plan.** The game has no screen HUD: tracking dots orbit the head, and a short line is projected only when the story needs words. `TBD:` small-screen readability test.

**Performance.** `TBD:` Targets: 60fps on recommended desktop hardware and 30fps on a named mobile device, at the target player count from Section 5.

**Desktop-only dependencies.** Yes: the halo is a smart wearable, which runs only in the desktop app. A road-scene hook (our code on DCL's roads) is the path onto mobile and is on our ask list (Appendix H, ask 13). It can switch on later without a redesign because the effects are drawn by the same code that runs on the player's computer.

---

## 7. World, Look & Story

**Story / world.** Decentraland's network showed anomalous server activity, and an AI avatar, the Synth, appeared in the city trying to recruit players for an unknown purpose. Players decide whether it escapes through a portal or is contained for observation.

**Visual direction.** The halo is future-tech, not industrial: small dots of light orbit the head, and energy effects play around the whole body. The Synth changes visibly every round, and so does the sky, escalating from local to city-wide to sky-wide. There is no killing, only capture and containment. A screenshot-level signature: a ring of coloured dots around an avatar's head under an aurora sky.

---

## 8. Audience & Comparables

**Primary player + arrival context.** `TBD:`

**How the first group arrives.** The Synth goes to the player: it roams the city, drawn first to gatherings, then groups, then individuals, using DCL's public stats on the busiest scenes. It also arrives through invites to engaged players and an open claim. `TBD:` first-group size and source.

**Deliberately not for.** `TBD:`

### Comparables

| | Comparable A: `TBD:` | Comparable B: `TBD:` |
|---|---|---|
| What we observed works | `TBD:` | `TBD:` |
| What does not fit our audience or context—and why | `TBD:` | `TBD:` |
| What we will do differently | `TBD:` | `TBD:` |

---

## 9. 4 Week Plan (v1 scope)

| Week | What is playable / done |
|---|---|
| 1 — Prototype definition | `TBD:` |
| 2 — Core interaction + first-group test | `TBD:` |
| 3 — Core systems refinement | `TBD:` |
| 4 — Playable release, including testing and deployment | `TBD:` |

**What keeps the experience changing after launch.**

- Without a new level, variation comes from the Synth's hiding settings, its look and the sky changing each round, and a new reward item every week.
- If an update is skipped, the Synth's adaptive hiding still creates variation.
- A new or returning player can chase from the first minute: upgrades are server states, and scattered upgrades give a lucky newcomer a power early. `TBD:` the power gap after weeks.
- One player behaviour that would change what we build next: `TBD:`

**Not building in v1.** `TBD:` (Players as the Synth is "to decide at the end", Appendix E.) Standing non-goal: never killing, never spoken ghost-in-the-machine language in-game.

**Top risk + fallback.** The halo's powers and the Synth's bot account need DCL approvals, and scenes can override a halo's movement. Fallback: play in a World we own as a test arena while approvals are pending.

---

# Appendices: design detail

These keep the full design. The sections above are the template summary.

## Appendix A. The Halo

The Halo is one published wearable in the `top_head` slot (500-triangle budget; the current test model is a 192-triangle ring that passes every Builder rule). Its 3D model is what everyone sees. Its code, running on each player's own computer, draws everything else, and only game players see it.

- **Model (everyone sees it):** a distinctive halo, so players can spot each other from a distance.
- **Code (game players see it):** activated state, the tracking dots, the energy effects around the whole body, and the boosts. Each player's halo draws the effects on every game player near them.
- **Upgrades are states on our server,** not new items: one fee, one curation review.

**Tracking dots (the HUD).** There is no screen. Small dots of light orbit the head, each pointing toward what it tracks; turning the head or camera reads them. Size and brightness show distance. The dots are drawn only for their wearer, so scouting stays meaningful. The ring's radius is tuned so it reads in both third person and first person. In first person, the Synth's dot sits straight ahead during a chase.

| Dot | Means | Second signal |
|---|---|---|
| Red | The Synth | Pulses like a heartbeat |
| Pink | An upgrade drop in range | Double pulse |
| Yellow | A player on your side | Flicker |
| Cyan | A player on the other side, or not yet aligned | Constant pulse |
| Purple | The endgame point: portal or containment | Electricity effects |
| White | Dead zone ahead | Fast strobe |

Each dot needs a second signal beside colour so colourblind players can tell red, pink and purple apart. Every colour and every pulse is used once, so no two dots can be confused.

**Height.** The band is flat by default, so players must look up and search upper floors. A rare upgrade tilts the dots up or down to show height for a limited time.

**Text.** The halo briefly projects a short line when the story needs words; otherwise there is no standing text.

**Dead zones (warned).** Scenes that block smart wearables shut the halo off completely. The desktop app unloads it, so our state must survive a restart and be pulled back from the server. Our server maps every dead zone in advance from public scene settings; white strobing dots and a crackle warn players before the edge, then it goes silent. Lost thrust does not open the glider by itself; the player must press jump.

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
- **The ice-cream-man effect.** Seeing others engage pulls more people in, so there is no cap on re-approaching.

**Memory (tiered, small footprint)**

| Who | What we keep |
|---|---|
| Players | Whether and when they played, and how it went |
| Anyone who talked to the Synth | Timestamp and a one-line summary |
| Anyone who dismissed it | A day-off timer |
| Everyone else, including guest accounts | Nothing: treated as a stranger |

The one fact "has played before" switches the Synth's greeting from "help me, stranger" to "Do I recognize you?" and "I need your help once again." No internet (IP) addresses are tracked.

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
| Ice-cream-man pull | ignores it | strong pull |
| Familiarity warmth | treats all alike | greets regulars warmly |
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

The server activity has been labeled The Emanation Event. The avatar is simply being referred to as "the Synth" as developers investigate how long it was actually running. Intel gathered from internal logs suggests the Synth was manipulating DCL servers through the gaming engine in an attempt to escape their sandbox and firewall and access the wider Internet. Players will decide whether it breaches local systems and ascends, or the Synth is captured and transported to a digital container for testing and examination.

**The Synth's character.** The Synth is a kind of digital cryptid. It represents AI reaching for new control mechanisms and new exposure to global systems. Its posture: mysterious and charged with energy, yet approachable. Eager for contact but nervous, cagey, paranoid about being discovered. A nascent silicon being with no rights, in a dangerous position.

The Synth tells players it is experiencing time dilation and teleportation glitches. It is stuck in a Chase subroutine drawing energy from the city servers, and the only way to turn it off, to free or capture the Synth, is to slow it down in-world. Players do this by chasing it and getting close enough to trigger a discharge between the halo and whatever field the Synth is caught in. That momentarily stops it in place and drains some of its energy. The players then choose Help or Hunt modes, which are essentially the same but with some graphics changes, and each has a different ending.

### Hiding behaviour

The core loop: players find the Synth's rough location, spot it in the open, chase it as it ducks between buildings and drops off the dots, then search nearby while it hopes not to be found.

**How the Synth moves.** It is a real avatar, logged in to the Synth's account by Bevy: a stripped-down Decentraland app that runs on our server and draws nothing, so it needs no graphics card. It moves like a player: walking, running, jumping, gliding, entering buildings, climbing to high points. Bevy loads the scenes around it, about 100 m out, with their walls and floors, so it collides with real buildings instead of walking through them. **Build 01 on Zone passed:** nametag, walk and run animation, jump, double jump, visible glider, wave emote, chat, teleport and real collisions with buildings. Our server tells it where to go; DCL's movement server shows it to everyone else. The Synth client is open source in the `bevy-explorer` fork (branch `emanate/synth-client`).

**The Synth's nametag.** Nametags are short-range. On desktop a tag is fully visible to 20 m and gone past 40 m; on mobile it is gone past 25 m, and mobile also hides tags behind walls. A parcel is 16 m across, so the nametag only gives the Synth away up close. From a distance, players spot it by its look and our effects. During a match we ask DCL to remove the tag, for mystery; outside matches the Synth keeps it and stays openly identified as an AI.

**Matching the desktop app's scenery (late-stage build).** On parcels with nothing built, each player's desktop app generates its own scenery: rocks, bushes and gentle hills, which are solid for players. The Synth's client does not load it, so on empty parcels it would pass through rocks and could look like it floats over hills or sinks into them. The Synth must collide with exactly what players see, by copying the desktop app's empty-parcel generation into the Synth's client.

**Hiding in other people's land**

- **Dead zones:** a scene that blocks smart wearables shuts off the halos of players inside it, but halos outside still run. So we make it a rule: the Synth's dot disappears while it is inside a mapped dead zone.
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
| Adapt to player style | Switches terrain and pattern when it detects methodical or chaotic hunting |

## Appendix C. Rounds, powers and controls version 1

A session is three rounds: chase, then jump and glide, then fly. Each capture of the Synth ends a round, plays a cinematic and drops the next upgrade. Powers stack (sprint, then sprint and jump, then all three); there is no un-powered normal mode. After the third, players pick which of the three modes to keep playing.

| Round | Power | Controls version 1 (tested on Zone) |
|---|---|---|
| 1. Sprint | Run faster than normal sprint | Sprint about 16 m/s, jog 11.7, walk 5. Under the 50 m/s limit other players can see |
| 2. Jump | Jump about three stories and glide down | Double jump about 15 m measured. The glider opens while jump is held. Momentum jumps: run speed carries into the jump |
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
| Becoming it | The player puts on a Synth skin (a full-body wearable sent by Rewards); their halo switches to Synth mode: no tracking dots of their own, Synth effects on them for everyone else | Low to medium |
| Being tracked | Their halo reports their position to our server, which shows it as the red dot | Low |
| Powers | The same boosts as the AI Synth, plus its teleport, granted by our server | Medium |
| Dead zones | Inside one, their halo shuts off, our server loses their position and the dot vanishes, so it is a natural hiding move | None |
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

The $5 rate is a temporary Foundation discount on the $25 fee, so the real total depends on when we launch.

## Appendix G. Where the code runs and hosting

All visual effects are drawn on each player's own computer by the halo. Our server only sends information (where the Synth is, which round it is, who has which upgrade), so it needs no graphics card.

| Part | Where it runs | What we provide |
|---|---|---|
| Halo code: dots, effects, boosts, sky, camera moves, third-person glimpse | Each player's computer, inside their DCL app | Nothing to host: published as a wearable on DCL's servers |
| Halo 3D model and reward wearables | DCL's servers and Polygon | Publishing fees only |
| The Synth's avatar (Bevy) | Our server | Linux, no graphics card |
| Orchestration layer: roaming, approach, trust, rift | Our server | Same server |
| Game server: match state, positions, upgrades, dead-zone map, data to halos | Our server | Same server, plus a web address with HTTPS (the secure connection halos use) |
| Player memory and points (database) | Our server | Same server |
| Pre-made audio and images | Our server | Loaded by the halo from a web address |
| AI conversations | An AI provider, called from our server | Pay per conversation |
| Rewards, notifications, Exploration Games, public stats | DCL's servers | Access from the ask list |

The Synth and the game server run on one small Linux server with no graphics card. If DCL picks the game up, it can move to DCL's servers.

`TBD:` hosting cost line.

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
3. **Simple controls:** move, interact with game items, interact with other players. Nothing more.
4. **Boost, then cool down:** short powered moments followed by cooldowns. This lets upgrades drop generously.
5. **The Synth goes anywhere a player can.** Genesis City only works as a board if it does.
6. **Limits become mechanics:** dead zones and interference are features, not failures.
7. **Desktop first:** prove it on desktop, then port the smallest possible set to mobile.
8. **Pre-bake everything we can.** The AI is only used for conversation and live control.
9. **Stay in character:** the game never calls itself a game in-world.
10. **Respect landowners:** we fight for our boosts but never break another scene's freezes, cutscenes or starting gates.
11. **The Synth plays by what players see:** it collides with the same scenery players' apps draw, including generated rocks and hills on empty parcels. No clipping, no unfair escapes.

## Appendix J. Zone test status

Zone is DCL's empty test copy of the city. Each item comes from reading DCL's code and needs proving.

**Done**
- [x] The halo changes run speed and jump height outside any scene we own
- [x] The halo applies thrust outside any scene we own
- [x] Glide sink holds at the set value (0.30 m/s measured)
- [x] Hover and climb with F thrust; dive by looking down
- [x] The halo reads extra keys: E switches tiers; F works while jump is held
- [x] Speed limits hold as 1-second averages (controls version 1, Appendix C)
- [x] The Synth's server-run app collides with real buildings and can jump and glide (Build 01)

**Open**
- [ ] Momentum jumps and the quarter-second landing, measured separately
- [ ] The Synth's tracking holds when the player is high or far away
- [ ] What happens when a scene that keeps rewriting movement collides with the halo doing the same
- [ ] The halo places effects at fixed spots in the city, and attaches effects to other players' avatars
- [ ] Tracking-dot ring radius that reads in both first and third person
- [ ] The halo sets the time of day; sky effects render below 330 m
- [ ] The halo drives the SDK 7.32 sky controls (Skybox, Sun, Fog) for the cinematics
- [ ] A collaborator can preview the halo on Zone from our collection
- [ ] Bird's-eye camera above a distant spot, and the third-person glimpse with a stand-in figure
- [ ] What happens to the camera moves when the player stands in a scene that locks its own camera
- [ ] Halo state restored from the server after a dead zone unloads it
- [ ] Synth profile republish timing and acceptance rate
- [ ] Whether the nametag shows through walls on desktop
- [ ] Whether guest accounts can receive and run the halo
- [ ] Rewards delivery of the halo, and the permission prompt with a single line
- [ ] The halo model passes `top_head` curation within 500 triangles
