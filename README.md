# Ghostcode

**Hide-and-seek across all of Decentraland's Genesis City.** An AI-run avatar, the **Synth**, has escaped and is hiding in the city. Players put on a free smart wearable, the **Ghostcode Halo**, and choose a side: **Hunters** try to capture the Synth, **Helpers** try to set it free. Play **Solo**, **Co-op** or **Multiplayer**.

- **The city is the board.** No parcels are rented or built. A blast throws every player into the sky at the start of each round, and you land somewhere new in Genesis City.
- **A real avatar as the Synth.** It is a logged-in avatar named "Synth (AI)", driven by our server, not a scene prop. It runs, hides on high or low ground, and glides away.
- **The Halo carries the game.** One wearable, free to every player. All effects and sounds are packed inside it. Each round raises everyone's power: **Sprint**, then **Jump** (double jump and glide), then **Fly**.
- **A stock avatar until you choose to play.** The Halo changes nothing and sends nothing about you until you step into the game's bubble and hold `E`.
- **Other people's land is part of the game.** Scenes that block smart wearables become dead zones; the Halo warns you automatically before you reach one.

The full design is in [`design/gdd.md`](design/gdd.md), written to DCL's Creator Success GDD template.

## Status

- **The Halo is published** as **Ghostcode Halo Test** in the collection **Ghostcode Test** (build `c31-final7`), and is awaiting review by DCL's curators. Once approved it will be free (price 0).
- **The Synth** runs as a real avatar on **Zone** (DCL's staging copy of the city) and collides with real buildings. It moves to production Genesis City once the Halo is approved.
- **Test scene for Creator Success:** the World **hiddenforces.dcl.eth** — `TBD: link once deployed`.

## How a match goes

1. **Join.** The Synth calls players into a glowing bubble ("Everyone into the bubble!"). Walk in and hold `E`. Players far away can join through a red portal that appears near them.
2. **Blast.** Everyone who joined is thrown high into the sky on a smoke trail and glides down somewhere new.
3. **Hunt.** A tall pale-cyan column, the **Glimpse**, shows where the Synth now stands. Race there.
4. **Charge.** Get within 5 m of the Synth. Solo, one touch charges it. In a group, the touches must come from different players on your side (three, or your whole side if it is smaller), each within 10 s of the last: the Synth slows, then freezes. A portal swallows it. Round won.
5. **Replay.** After three rounds, the final portal takes the winning side's colour. Two replay portals stand for ten seconds, purple for Hunters and gold for Helpers: walk into one to pick your side for the next game.

| Mode | Players | How it plays |
|---|---|---|
| **Solo** | 1 | You chase the Synth alone across three rounds. |
| **Co-op** | 2–5 | Everyone on one side; spread out and guide each other with Signal Flares. |
| **Multiplayer** | 6+ | Hunters against Helpers, at least 3 a side, balanced automatically. Arriving while the other side is charging breaks their charge. |

## Keys

| Key | What it does |
|---|---|
| `E` (in the bubble, hold) | Join the game |
| `E` (in a game) | Place a Discharge Trap: anyone who comes within 5 m drops a power level for 10 s (it skips the player who placed it) |
| `4` | Signal Flare: a plume in the sky where you stand, so others can find the spot |
| `Space` in the air | Open your glider |
| `Ctrl` + `Shift` + `E` | Pause; hold 3 s to leave for good |

## Privacy

Before you join, the Halo sends nothing about you. After you join, it sends your wallet address, name and position to our game server while you play. It asks one permission, `USE_FETCH`. The full notice, and how to have your data deleted: <https://ghostcode.hiddenforces.net/privacy>

## Repo map

| Path | What it is |
|---|---|
| `design/gdd.md` | Game design document (DCL GDD template + appendices) |
| `halo/` | The Halo smart wearable: scene code in `src/` (game layer, effects, sounds, server link), `wearable.json`, model, thumbnail, packed audio; `PROTOCOL.md` describes the server link |
| `game-server/` | The game server: match rules, the Synth's brain and navigation, the Halo control channel and kill switch, the privacy notice |
| `halo-tools/` | Builder-rule validator, zip and texture checks, physics simulations, a unit test harness with a fake SDK, model, thumbnail, texture and tone generators |
| `media/` | Showcase clip and thumbnail |

The Synth's client is a separate repo: a fork of [`decentraland/bevy-explorer`](https://github.com/decentraland/bevy-explorer), branch `emanate/synth-client` ([Mayakovsky/bevy-explorer](https://github.com/Mayakovsky/bevy-explorer)).

## Build and test

- **Pack the Halo:** `cd halo && npm install && npm run pack` (writes `smart-wearable.zip` for DCL's Builder).
- **Check the zip:** `python halo-tools/validate_zip.py halo/smart-wearable.zip` (the Builder's rules).
- **Unit tests:** `halo-tools/unit/` runs the Halo's logic against a fake SDK.
- **Game server:** `node game-server/src/server.ts`; tests: `node --test game-server/test/*.test.ts` (see `game-server/README.md`).

## Sound credits

All sounds are public domain (CC0) or CC BY 4.0, from Freesound: qubodup, DneproMan, Glitchedtones, FreqMan, j_soundeffects, csengeri, DefySolipsis, Iwiploppenisse, CAT-FOX_ALEX, solarpsychedelic, metrostock99. The full list, per sound, is in [`halo/audio/AUDIO-CREDITS.md`](halo/audio/AUDIO-CREDITS.md). "Horn on 1979 Mercury Zephyr Sedan" by j_soundeffects and "dun dun dun synth" by FreqMan are used under CC BY 4.0.

## Contact

Hidden Forces — Discord `hiddenforces`.

## Licence

No licence has been chosen yet.
