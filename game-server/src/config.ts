// Emanate game server settings. Every rule Forces has NOT decided is a setting here, listed in UNCONFIRMED.
export type Mode = 'solo' | 'coop' | 'multiplayer'
export type Side = 'hunters' | 'helpers'

export const CONFIG = {
  // ---- decided in design v3 ----
  roundSeconds: 20 * 60,
  warnSecondsLeft: 5 * 60,
  rounds: 3,
  chargeRadius: 5, // m: Halo Charging Effects / charge contact
  chargeWindowSeconds: 10, // Reset Mode slows 10 s; each next contact must land within the window
  teleportOnFailRadius: 100, // m: Synth teleported within 100 m after a failed charge or timeout
  synthStartDistance: 100, // solo: Synth begins 100 m from the player
  coopSynthMaxFromFarthest: 300, // coop: within 300 m of the player farthest from Gen Plaza
  plumeSeconds: 14,
  plumesPerRound: 3,
  pickupRadius: 2, // placeholder rule (directive)
  upgradeNearbyRadius: 80,
  haloBoostSeconds: 30,
  haloBoostMaxRound: 2, // only rounds 1-2; a Halo boost applies the moment it is picked up (round 11B: no held upgrades, E is the Discharge Trap)
  genPlaza: { x: 0, z: 0 },
  // ---- UNCONFIRMED (Forces has not decided; defaults from the directive) ----
  playersNeededCoop: (groupSize: number) => Math.min(3, groupSize), // UNCONFIRMED
  multiplayerWinner: 'best-of-three' as 'best-of-three', // UNCONFIRMED
  endgameArrival: { rule: 'majority-or-all-after-30s', majorityOfSide: true, allAfterSeconds: 30 }, // UNCONFIRMED
  plumeVisibleTo: 'everyone-in-match' as 'everyone-in-match' | 'own-side', // UNCONFIRMED
  plumeColor: 'neutral-grey', // UNCONFIRMED: one neutral colour for everyone, so it does not reveal sides
  // ---- round 11B: the Synth's power level (Addendum 1) and the Discharge Trap ----
  synthStartLevel: 1, // the Synth starts at level 1 (Speed) in round 1, like the players
  soloCoopChargeDelta: 1, // Solo and Coop, either path: every completed Charge raises the Synth one level next round
  multiHelperChargeDelta: 1, // Multiplayer: Helpers complete the Charge: the Synth gains a level
  multiHunterChargeDelta: -1, // Multiplayer: Hunters complete the Charge: the Synth drops a level (floor 0 = normal speed)
  synthMinLevel: 0,
  synthMaxLevel: 3,
  trapDelta: -1, // a Discharge Trap hit: one level down (players and the Synth), min 0
  trapSeconds: 10, // for this long
  trapRadius: 5, // m: a trap triggers when the Synth or any player comes this close
  trapLifeSeconds: 120, // UNCONFIRMED: an untriggered trap expires on its own
  // ---- round 12: the lobby (a bubble around the Synth and a join timer) and the optional toss start ----
  lobbyEnabled: false, // a lobby before round 1 (the server turns it on with EMANATE_LOBBY=on)
  lobbySeconds: 60, // the join timer
  bubbleRadius: 5, // m (RADIUS; Forces 2026-11-22: 5 m, was 10): players inside the dome when the timer ends are in the game; the others wait for the next lobby. The halo draws at most 15 m
  teleportStart: false, // round 18: when a Coop or team game starts, the group is thrown across the map with movePlayerTo (default off; the env EMANATE_TELEPORT_START=on turns it on)
  teleportMinMetres: 300, // how far the start point is from the bubble
  teleportMaxMetres: 800,
  teleportRingMetres: 6, // the group lands in a ring this wide around the start point
  teleportDropMetres: 25, // and arrives this far above the ground (movePlayerTo drops them)
  coopSynthMin: 100, // Coop and Multiplayer: players start where they stand in every round; the Synth is placed this far
  coopSynthMax: 300, // ... to this far from the group's centre
  tossStartRounds: [] as number[], // the lift-and-glide start in these rounds (rounds 1 and 2 only; default off until Forces has tried it)
  blastStart: false, // c27: at the start of round 1 every joined Halo is blasted into the sky (env EMANATE_BLAST_START=on turns it on)
  blastCentre: 'self' as 'self' | 'synth', // the planned landing is within blastRadius of the wearer ('self') or of the Synth ('synth')
  blastRadius: 500, // m
  callsEnabled: true, // c27: the call to far wearers (the `calls` switch)
  callThreshold: 2, // the estimated number of Halos checking in (from the anonymous check-in rate) needed before a lobby start is called out
  callSeconds: 45, // how long the call stays up
  callMinFarMetres: 50, // the Halo shows the portal only to wearers farther than this from the Synth
  tossAltitude: 150, // m: how high the lift goes (the halo's limit is 200 m)
  completeFreezeSeconds: 0, // the Synth freezes this long after a completed Charge before it is teleported (the server turns on 2 s; 0 keeps the tests instant)
  multiplayerWinsNeeded: 3, // Multiplayer: the first side to win this many rounds wins; a timed-out round does not count
  multiplayerMaxRounds: 5, // rounds 4 and 5 keep the full Fly kit and replay the round-three sky
  // ---- placeholders chosen by Kov (not in the directive); also UNCONFIRMED ----
  dropExpirySeconds: 90, // UNCONFIRMED: how long a scattered upgrade lasts
  dropMax: 3, // UNCONFIRMED: drops alive at once
  dropSpawnMinMax: [40, 120] as [number, number], // UNCONFIRMED: metres from the action centre
  dropSpawnEverySeconds: 25, // UNCONFIRMED
  roundFailResetsRoundTimer: false, // UNCONFIRMED: "the round resets" after a failed charge: charge state resets, the 20 min clock keeps running
  playerTimeoutSeconds: 10, // a player not heard from for this long is dropped from the match
  // ---- round 8 ----
  timeoutGlimpseSeconds: 8, // on a round timeout, how long the glimpse of the Synth's hiding spot lasts before it is moved
  finalCinematicAfterReplays: 3, // UNCONFIRMED: completed rounds played in the replay menu that trigger the final cinematic
  ledgerSeconds: 600, // a player who drops (a halo unload) gets their round state back if they return within this time
  choiceDialogue: false, // the Synth's pitch and the secret side choice (the server turns it on with EMANATE_CHOICE=on)
  // ---- c30 (Directive V): the new game sequence (Plasma Portals, blast at every round start, the Glimpse Signal, the replay portals). Off here so the older tests keep their meaning; the live server turns it on (EMANATE_CINEMATICS, default on) ----
  cinematics: false,
  cineFx: false, // c30b (Directive W): the three cinematic effects (Strike E8, Aurora E9, Storm E10) are switched off; their recipes stay in the Halo; set true (round-config) to bring them back for a redesign
  portalSeconds: 4, // PP1 / PP2 stand this long before the Synth is gone and the cinematic or blast follows
  strikeSeconds: 2, // E8 (after round 1) plays this long, then the blast
  auroraSeconds: 20, // E9 (after round 2) plays alongside the blast
  stormSeconds: 16, // E10 (the ending)
  glimpseSeconds: 7, // E12 stays this long in rounds 1 and 2
  glimpseSecondsLast: 4, // ... and this long in round 3 (the flying round)
  replaySeconds: 10, // the two replay portals stand this long
  replayOpenDelay: 2, // c30d: s between PP2's end and the replay portals opening, so the Synth that went into PP2 is out of every viewer's sight first (Directive: Synth still drawn at replay-open)
  autosortSeconds: 2, // in the last seconds the server sorts whoever has not picked a portal, to balance the teams
  replayMin: 0, // players needed in range at the end of the countdown; 0 = the mode rules (solo 1, coop 3, multiplayer 6 with at least 3 a side)
  replayRange: 60, // m from the portals: players this close count as "in range" at the end
  portalOffset: 6, // m: each replay portal stands this far from the middle (side by side)
  portalJoinRadius: 3, // m: walking this close to a replay portal picks that faction
  maxDrops: 6 // c30: upgrade drops a round creates (all at the round start, shown until collected); the halo draws at most this many
}

export const UNCONFIRMED = [
  'playersNeededCoop = min(3, group size)',
  'multiplayerWinner = best of three rounds',
  'endgameArrival = majority of the side present, or everyone present after 30 s',
  'plumeVisibleTo = everyone in the match',
  'plumeColor = one neutral colour for everyone',
  'trapLifeSeconds = 120 (an untriggered Discharge Trap expires on its own)',
  'dropExpirySeconds = 90, dropMax = 3, dropSpawnMinMax = 40-120 m, dropSpawnEverySeconds = 25 (Kov placeholders)',
  'roundFailResetsRoundTimer = false (a failed charge resets the charge, not the 20 min clock)',
  'finalCinematicAfterReplays = 3 completed rounds played from the replay menu (counts completed rounds, in any combination)'
]
