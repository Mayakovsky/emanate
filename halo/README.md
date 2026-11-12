# Emanate halo

The halo is a Decentraland **smart wearable** (`top_head` slot, SDK7). Its 3D model is a low-poly ring; its code runs on each player's own computer and gives the movement powers: Sprint, then Jump (double jump, glide), then Fly. `E` cycles the tiers.

- `src/index.ts` — the wearable's scene code: tiers, forces, limits (the tunables are named constants at the top).
- `wearable.json`, `scene.json`, `halo.glb`, `thumbnail.png` — the wearable definition and model.
- Controls version 1 values and their measured results are documented in `../design/gdd.md` (Appendix C).

## Build and pack

```
npm install
npm run build
npm run pack     # writes smart-wearable.zip for DCL's Builder
```

Check the zip against the Builder's rules with `../halo-tools/validate_zip.py <zip>`.
