# Ghostcode game server (source)

The Node 24 TypeScript game server for Ghostcode (no dependencies; type stripping): match rules, the Synth's brain and navigation brain, the halo control channel (settings, commands, kill switch, version policy), the bridge for the Synth, and the privacy notice served at `/privacy`.
Run: `node src/server.ts` (see `src/config.ts` and the `EMANATE_*` environment variables). Tests: `node --test test/*.test.ts` (some tests read the map data files, which are not in this repository).
Deployment scripts, test tools, logs and data are kept out of this repository on purpose.
