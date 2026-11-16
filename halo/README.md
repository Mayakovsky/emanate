# Emanate halo

The halo is a Decentraland **smart wearable** (`top_head` slot, SDK7). Its 3D model is a low-poly ring; its code runs on each player's own computer and gives the movement powers: Normal, then Sprint, Jump (double jump, glide) and Fly. The game server sets the tier. `E` places a Discharge Trap.

- `src/index.ts` — the wearable's scene code: tiers, forces, limits (the tunables are named constants at the top).
- `src/game.ts`, `src/fx.ts`, `src/net.ts`, `src/logic.ts`, `src/dialog.ts`, `src/sky.ts`, `src/audioSlots.ts` — the game layer: the arrows, plumes and warnings, the lobby bubble, the Discharge Trap, and the sync with the local game server (it reports over http to `127.0.0.1:8787` and needs the `USE_FETCH` permission). Without the server it runs in a test mode.
- Test keys (Ctrl + 1 lift and glide, Ctrl + 2 bubble burst, Ctrl + 3 `movePlayerTo` probe) report to the screen and the server log; they are for trying the wearable and are not part of the game.
- `wearable.json`, `scene.json`, `halo.glb`, `thumbnail.png` — the wearable definition and model.
- Controls version 1 values and their measured results are documented in `../design/gdd.md` (Appendix C).

## Build and pack

```
npm install
npm run build
npm run pack     # writes smart-wearable.zip for DCL's Builder
```

Check the zip against the Builder's rules with `../halo-tools/validate_zip.py <zip>`.
