# The Ghostcode halo protocol (halo candidate `c23a`, protocol 1)

The halo is a **thin client**: only the asset set (code, model, sounds) and the command vocabulary are frozen when the item is published; the numbers, texts, sound mapping, effect parameters and feature switches come from the server. This file is the contract. Everything below is implemented in `halo-build04\src\settings.ts` (halo) and `game-server\src\halocontrol.ts` (server); the tests are `halo-build04\test\settings.test.ts` and `game-server\test\halocontrol.test.ts`.

## 1. The channel (one permission: `USE_FETCH`; no WebSocket, no new permission)
**Halo to server, every tick (`POST /tick`, 4 a second by default):** the fields the privacy notice lists (address, display name, position, local position, speed, tier, side, events, log lines) **plus three version fields**: `v` (build id, today `c23a`), `pv` (protocol version, today `1`), `sv` (the settings version the halo holds; 0 = its built-in defaults). The privacy notice at `/privacy` was updated to say so.

**Server to halo (the tick reply):**
| field | meaning |
|---|---|
| `state` | the match state (unchanged) |
| `sv` | the server's settings version |
| `settings` | present only when the halo's `sv` differs: the **overrides** (see section 2); `{}` means "you held overrides that are gone: use your defaults" |
| `cmds` | a list of commands (section 3), at most 20 a reply, drained once |
| `idle` | `true` = the kill switch is on (section 4); `false` otherwise |
| `refuse`, `message` | `true` = this build is refused by the version policy (section 5); the halo goes idle and shows `message` |

**Settings are fetched at start** (the halo's first tick sends `sv: 0`, the reply carries any overrides) **and whenever they change** (the server bumps `sv`; the next tick brings the new overrides, at most one tick period, normally 0.25 s). With no overrides set the server sends none and the halo runs on its built-in defaults, which are today's values.

**While idle** the halo sends nothing about the player: it makes one bare `GET /halo/state?pv=<n>&v=<build>` every `tick.idlePollSec` (default 60 s), with no address, name or position, and wakes up when the answer says `idle: false`.

## 2. Settings: what the server can set (each has a built-in default and, for the powers, a hard limit the halo enforces whatever the server says)
Sections and counts: **power 27, rules 18, fx 17, features 11, text 11 (and any new text key), tick 2, sounds (a free map)**: 86 named values plus the two free maps. A value is accepted only if the key exists and the type matches; numbers are clamped; anything else is ignored.

**`power`** (the movement powers; defaults = today's; hard limits in brackets): walkSpeed 5 [1..12], jogSpeed 11.7 [1..30], runSpeed 16.2 [1..30], jumpHeight 1.6 [0.2..6], runJumpHeight 2.2 [0.2..8], doubleJumpHeight 9 [0.2..14], flySink 0.3 [0.05..5], fyHold 7, fyRising 27, fyEase 24, climbForce 30, climbMax 14.5, diveForce 25, diveMax 16.2, diveSink 20.3, fwdForce 22, ceiling 200 [20..220], speedCap 24.3 [5..30], brake 40, hMax 19.2 [5..26], diveBrakeStart 17.8, diveBrake 16, ceilingTaper 45, landCooldown 0.25 [0..2], jumpBonus 0.25, airImpulse 0.3, airCarryK 0.55.
**`rules`**: arrowOnSec 4, arrowCooldownSec 7, warnCooldownSec 5, overloadRadius 100, trapRadius 5, trapSeconds 10, upgradeRadius 80, deadZoneBaseMetres 10, deadZoneSeconds 2, plumeSeconds 14 [1..60], plumesPerRound 3, chargeRadius 5, pickupRadius 2, boostSeconds 30, arrowSpeedMin 0.8, arrowSpeedMax 4.5, arrowSpeedFarMetres 300, airborneMetres 3.
**`fx`**: chevrons 6 [2..10], chevronSpacing 2.4, chevronStart 1.8, plumePuffs 24 [4..48], plumeHeight 120, plumeRise 9, plumeBase 1.2, plumeGrow 3, plumeSway 2.5, plumeRed 1, plumeOrange 1, plumeSmoke 1 (the proportions of the three puff colours), riftSeconds 3, riftRadius 14, liftAltitudes 4, gliderPrompt 1, gliderPromptSeconds 4.
**`features`** (1 on, 0 off): arrows, plumes, trap, deadzoneWarn, cinematics, bubbleFx, sounds, debugPanel, powers, activeLine; `notes` is reserved (no effect yet).
**`text`**: activeLine, gliderPrompt, idle, refused, roundStart `{round}`, trapPlaced, trapDenied, plumeSent, noPlumes, lobbyCall, lobbyEnd `{mode}` `{count}`; any other key may be added and used by a future command (strings up to 200 characters).
**`tick`**: everySec 0.25 [0.1..5], idlePollSec 60 [10..3600].
**`sounds`**: a map from a sound slot id (the ids in the audio list, for example `halo.plume`) to another slot id, to `lib:<name>` (a tone of the library below) or to `""` (silent). Empty by default.

## 3. Commands (server to halo)
A command is `{ "c": <name>, "v": <protocol it needs (optional)>, ...parameters }`. **Unknown commands, commands that need a newer protocol (`v` above the halo's), and malformed parameters are ignored, never an error**, so a newer server never breaks an older halo. The server queues commands per wearer address, or for everyone (`halo-cmd` with `to: "all"`).
| command | parameters | effect |
|---|---|---|
| `hud` | `text`, `seconds` | a line on the screen (empty text clears it) |
| `sound` | `id` | play a slot id or `lib:<name>` |
| `fx` | `kind`, `x,y,z` (world) or `at:"me"`, `size`, `seconds`, `color` (a name or `[r,g,b]`), `n`, `height`, `heading` | spawn an effect from the library |
| `push` | `x,y,z`, `seconds` | a force on the wearer for up to 10 s (limited to 40 N sideways, 60 up) |
| `lift` | `altitude` | the lift-and-glide start: the halo lifts the wearer to the altitude, releases, and prompts "HOLD JUMP to open the glider" |
| `teleport` | `id`, `x,y,z` | the existing `movePlayerTo` call, result reported to the server (the old `teleport` event still works) |
| `tick` | `every` | the tick period in seconds |
| `feature` | `name`, `on` | switch a feature on or off |
| `idle` | `on` | the kill switch from the server side of a command |
| `settings` | | fetch the settings again at the next tick |
The old events (`contact`, `round-start`, `round-complete`, `lobby-end`, `stage`, `pickup`, `trap-hit`, ... and `toss`, which now means `lift`) keep working as before.
**Admin (server side):** `halo-settings` (`{set:{power:{runSpeed:18}}}` or `{reset:true}`), `halo-cmd` (`{to:"all"|<address>, command:{...}}`), `halo-idle` (`{on:true|false}`), `halo-policy` (`{minPv, message}`), `halo-versions` (counts of build and protocol versions seen, no addresses).

## 4. The kill switch
`halo-idle` on: the next tick reply is `{idle:true}` and the server does **not** process that tick. The halo removes every force and every effect, deletes its locomotion overrides (the client's own movement returns), closes any dialogue, stops sending anything about the player and shows only `text.idle`. It then polls `/halo/state` (no player data) to learn when to wake. Also reachable by the `idle` command.

## 5. Version policy
Every tick carries `v` and `pv`. The server counts them (`halo-versions`, no addresses). `halo-policy {minPv: n}` makes the server refuse a halo whose `pv` is below `n` (a halo that sends none counts as 0): it gets `{refuse:true, message}`, goes idle and shows the message; its tick is not processed. **Default `minPv` is 0: every halo, old or new, is served.** The earlier build `c48d76c4` sends no version fields and keeps working.

## 6. The effect and sound library inside the zip (everything original or generated; 1.36 MB unzipped in all, limit 3 MB)
**Effect kinds** (`fx` command; drawn from plain meshes with unlit colour, shrinking is the fade): `sphere`, `ring`, `column`, `pulse` (an expanding ring), `spark` (a burst of sparks under gravity), `smoke` (puffs that rise and thin out), `arrow` (a pointer on the ground in a heading), `rift` (the Rift opening: a dark column splits upward, three rings roll out, sparks burst). Colours: red, orange, yellow, green, blue, cyan, purple, pink, white, black, grey, smoke, or `[r,g,b]`. Limits: 24 effects and 160 parts alive at once, size at most 60 m, 60 s.
**Sound library** (32 generated tones, 662 KB; `lib:<name>`): cue_event, cue_good, cue_bad, cue_warn, cue_alert, cue_round_start, cue_round_end, cue_charge_a, cue_charge_b, cue_charge_c, cue_lobby, cue_burst, cue_rift, cue_plume, cue_trap, cue_pickup, cue_power_up, cue_power_down, cue_glide, cue_lift, cue_teleport, cue_tick, cue_low, cue_high, spare_01 to spare_08. Generator: `halo-tools\gen_lib_tones.py`. Sound slots that have a **server recording** still play that first (the 30-second manifest), so the sound design can also be replaced live with real recordings.

## 7. What is frozen in the halo, and what the server can change
| Frozen in the halo (needs a new item to change) | Changeable from the server (live, no upload) |
|---|---|
| The movement **algorithm** (how thrust, brake, carry and glide forces are computed) and the tier structure (1 Speed, 2 Jump, 3 Fly) | Every **number** of it (section 2 `power`), within the hard limits; **which tier** a wearer is in |
| The **key map** (1 to 4, E, F, Jump, Ctrl and Shift combinations) | Whether each feature is **on** (`features`); a key's behaviour only through its feature switch and its numbers |
| The **drawing code** of every effect, the cinematics' timelines, the dome, the endgame, the dialogues and their wording, the test mode | New visuals from the **effect library** by command (kind, size, colour, duration); sizes and counts of the plume and arrows |
| The **vocabulary**: the event types and commands listed above (unknown ones are ignored) | When and where each is used (any rule, any round, any moment) |
| The **model**, the thumbnail, the 32 library tones, the 10 placeholder tones | Which sound plays for which event (`sounds` map); real **recordings** by the audio manifest |
| The server **address** and the tick body's fields (+ `v`, `pv`, `sv`) | The settings, texts, tick rate, idle, refusal by version, all game rules and the Synth |
| The permission (`USE_FETCH`) | |
Still hard-coded in the halo and **not** server-settable: the dialogue and cinematic texts, the cinematic timelines, the endgame and portal geometry, the charge-arc look, the trap and drop markers, the sky dome, the test-mode world, the bird's-eye camera heights, and the diagnostic panel's layout. They are listed in the freeze audit.

## 8. Gate status for the candidate
See the "Round 23 report" in `EMANATE-BUILD-04B-KOV-report.md` for results; zip `emanate-halo-c23a.zip`.
