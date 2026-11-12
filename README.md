# Emanate

**Hide-and-seek across all of Decentraland's Genesis City.** An AI-run avatar, the **Synth**, hides and runs. Players hunt it with a free smart wearable, the **halo**, which gives them tracking dots and stacking movement powers. Play solo, as a group, or in teams. *(Emanate is a working title.)*

- **The city is the board.** No parcels are rented or built. The Synth goes anywhere a player can: into buildings, up to rooftops, gliding off high points.
- **A real avatar as the Synth.** It is a logged-in avatar driven by our AI, not a scene prop.
- **The halo carries the game.** One wearable, free to every player: a ring of coloured dots points toward what you track, and three tiers of powers stack as you capture the Synth — **Sprint**, then **Jump** (double jump and glide), then **Fly**.
- **Other people's land is part of the game.** Scenes that block smart wearables become dead zones to hide in; scenes with their own movement rules interfere at random.

The full design is in [`design/gdd.md`](design/gdd.md), written to DCL's Creator Success GDD template.

## Status

Core-mechanic prototype on **Zone** (DCL's staging copy of the city):

- Halo movement powers: sprint, jump, double jump, glide and flight work and are tuned. **Controls version 1** is the current baseline; its values and measured results are in the GDD, Appendix C.
- The Synth runs as a real avatar on a headless client (see below) and collides with real buildings.
- Tracking dots and effects (the next build) are not built yet.

## Repo map

| Path | What it is |
|---|---|
| `design/gdd.md` | Game design document (DCL GDD template + appendices) |
| `halo/` | The halo smart wearable: `src/index.ts` (scene code), `wearable.json`, model and thumbnail |
| `halo-tools/` | Builder-rule validator, physics simulations, a unit test harness with a fake SDK, model and thumbnail generators |
| `media/` | Showcase clip and thumbnail |

The Synth's client is a separate repo: a fork of [`decentraland/bevy-explorer`](https://github.com/decentraland/bevy-explorer), branch `emanate/synth-client` ([Mayakovsky/bevy-explorer](https://github.com/Mayakovsky/bevy-explorer)). A branch `build-03-visuals` here holds the tracking-dot prototype.

## Try the halo on Zone

1. Build and pack the halo: `cd halo && npm install && npm run pack`.
2. Check the zip: `python halo-tools/validate_zip.py halo/smart-wearable.zip` (all Builder rules).
3. Upload the zip as a smart wearable in DCL's Builder on **Zone**, equip it, and open it with *See in Decentraland* on Zone.
4. Hold jump to open the glider, hold `F` to push along the camera, and press `E` to change tier.

Zone is a test environment: nothing here runs in production Genesis City.

## Tests and tools

- `halo-tools/validate_zip.py` — 30 Builder checks on a packed wearable.
- `halo-tools/climb_sim.py`, `climb_sim_ceiling.py`, `jump_sim.py` — physics simulations used to set the tunables.
- `halo-tools/unit/` — logic tests of the halo against a fake SDK (`run.ts`, `run2.ts`, `run3.ts`).

## Licence

No licence has been chosen yet.
