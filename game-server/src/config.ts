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
  bubbleRadius: 10, // m: players inside the dome when the timer ends are in the game; the others wait for the next lobby
  teleportStart: false, // round 18: when a Coop or team game starts, the group is thrown across the map with movePlayerTo (default off; the env EMANATE_TELEPORT_START=on turns it on)
  teleportMinMetres: 300, // how far the start point is from the bubble
  teleportMaxMetres: 800,
  teleportRingMetres: 6, // the group lands in a ring this wide around the start point
  teleportDropMetres: 25, // and arrives this far above the ground (movePlayerTo drops them)
  coopSynthMin: 100, // Coop and Multiplayer: players start where they stand in every round; the Synth is placed this far
  coopSynthMax: 300, // ... to this far from the group's centre
  tossStartRounds: [] as number[], // the lift-and-glide start in these rounds (rounds 1 and 2 only; default off until Forces has tried it)
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
  choiceDialogue: false // the Synth's pitch and the secret side choice (the server turns it on with EMANATE_CHOICE=on)
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
