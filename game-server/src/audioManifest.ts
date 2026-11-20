// The audio slot manifest: ONE list of every sound event in the game. Each slot has a file name Forces records to.
// The halo plays, in order: (1) the server's recording, if the file exists in game-server\audio and the halo can reach the server;
// (2) a recording packed into the halo zip (halo-build04\audio\<file>); (3) a generated placeholder tone.
// Audio is public domain or Forces's own recordings only. Voice lines are recorded by Forces, with effects added.
export type Category = 'Synth voice' | 'Warnings' | 'Round and charge' | 'Halo' | 'Cinematic 1: the Rift' | 'Cinematic 2: the aurora' | 'Cinematic 3: Carrington' | 'The ending'

export interface Slot {
  id: string
  category: Category
  /** what it is, and for voice slots the line (final text is written when it is recorded) */
  what: string
  /** voice: the line; effect: empty */
  line: string
  /** when it plays */
  when: string
  /** placeholder tone in the halo zip used until a recording exists (null: silent) */
  tone: string | null
  loop?: boolean
  /** target length in seconds, a guide for recording */
  seconds: number
}

const S = (id: string, category: Category, what: string, line: string, when: string, tone: string | null, seconds: number, loop = false): Slot => ({ id, category, what, line, when, tone, seconds, loop })

export const SLOTS: Slot[] = [
  // ---- the Synth's voice: greetings by tone (v3: familiarity switches the greeting) ----
  S('synth.greet.stranger', 'Synth voice', 'Greeting to someone who has not played (a Stranger)', 'Help me, Stranger.', 'The Synth approaches a new player (entry portal)', null, 3),
  S('synth.greet.helper', 'Synth voice', 'Warm greeting to a former Helper', 'Please help me again.', 'The Synth approaches a player whose last side was Helper', null, 3),
  S('synth.greet.hunter', 'Synth voice', 'Teasing greeting to a former Hunter', "We'll see if you can catch me again!", 'The Synth approaches a player whose last side was Hunter', null, 3),
  S('synth.whisper.1', 'Synth voice', 'Pre-made low whisper 1 (the Synth whispers at short intervals when near)', '(a short whispered phrase)', 'The Synth lingers near a player', null, 3),
  S('synth.whisper.2', 'Synth voice', 'Pre-made low whisper 2', '(a short whispered phrase)', 'The Synth lingers near a player', null, 3),
  S('synth.whisper.3', 'Synth voice', 'Pre-made low whisper 3', '(a short whispered phrase)', 'The Synth lingers near a player', null, 3),
  S('synth.backoff', 'Synth voice', 'The Synth backs off when told no', "Understood. I'll leave you be.", 'A player dismisses the Synth', null, 3),
  S('synth.handoff.put_on', 'Synth voice', 'Handoff: walking a new player through the halo and the permission prompt', 'Open your pack. Put on what I gave you. Let it in.', 'The halo is delivered to a new player', null, 5),
  S('synth.handoff.put_on_again', 'Synth voice', 'Handoff for a returning player', 'Put it on again.', 'A returning player is handed the halo', null, 2),
  S('synth.mobile', 'Synth voice', 'To a mobile player (cannot play yet)', 'You cannot help me yet.', 'A mobile player talks to the Synth', null, 3),
  // ---- warnings ----
  S('warn.deadzone', 'Warnings', 'Voice warning before a dead zone', 'Approaching dead zone.', 'The dead-zone warning fires (10 m or 2 s of travel from the boundary)', 'deadzone', 2),
  S('warn.upgrade', 'Warnings', 'Voice warning: an upgrade is near', 'Upgrade available.', 'An upgrade drop comes within 80 m', 'upgrade', 2),
  S('warn.five_minutes', 'Warnings', 'Five minutes left in the round', 'Five minutes remaining.', 'The round clock reaches 5:00 left', 'warn5', 2),
  S('warn.interference', 'Warnings', 'Interference: a tingling electrical crackle when a scene overrides the halo (not warned in words)', '', 'A scene with its own movement rules overrides the halo', 'crackle', 2),
  S('role.double_agent', 'Warnings', 'You were moved to the other side by auto-balance', 'You were recruited as a double agent.', 'Multiplayer auto-balance moves a player', null, 3),
  // ---- round and charge ----
  S('round.start', 'Round and charge', 'A round begins', 'Round begins.', 'Start of each round', null, 2),
  S('round.complete', 'Round and charge', 'A round is won (charge completed)', 'Charge complete.', 'The third contact (or last needed) completes the charge', 'charge', 2),
  S('round.timeout', 'Round and charge', 'Time ran out; the Synth is moved', 'Time is up.', 'The 20 minute clock ends', null, 2),
  S('charge.contact', 'Round and charge', 'Charging effect begins: arcs from the halo to the Synth', '', 'A player comes within 5 m of the Synth', 'charge', 2),
  S('charge.reset', 'Round and charge', 'Synth enters Reset Mode (slowed for 10 s)', '', 'First contact', 'charge', 2),
  S('charge.repair', 'Round and charge', 'Synth enters Repair Mode (Hunters) and freezes', '', 'Second contact by Hunters', 'charge', 2),
  S('charge.upgrade', 'Round and charge', 'Synth enters Upgrade Mode (Helpers) and freezes', '', 'Second contact by Helpers', 'charge', 2),
  S('charge.broken', 'Round and charge', 'The opposing side breaks the charge', '', 'An opposing player arrives while a charge is under way', 'overload', 2),
  S('charge.failed', 'Round and charge', 'The 10 s window ran out; the Synth is moved', '', 'No further contact within 10 s', 'nokey', 2),
  // ---- the halo ----
  S('halo.discharge', 'Halo', 'Discharge trap (not built yet)', '', 'A player uses the discharge trap', null, 2),
  S('halo.plume', 'Halo', 'A plume is launched', '', 'Key 4', 'plume', 2),
  S('halo.upgrade_pickup', 'Halo', 'An upgrade is picked up', '', 'Walking within 2 m of a drop', 'upgrade', 2),
  S('halo.boost_on', 'Halo', 'Halo boost starts (next power level, 30 s)', '', 'Using a Halo boost (key E)', 'upgrade', 2),
  S('halo.arrow_overload', 'Halo', 'The red arrow is overloaded inside 100 m: a sputter / failed animation', '', 'Key 1 within 100 m of the Synth', 'overload', 2),
  S('blast.crack', 'Halo', 'The blast launch: a short lightning-style crack (Forces makes the file; placeholder = the crackle tone)', '', 'The game-start blast and the Ctrl+E re-throw', 'crackle', 1),
  S('halo.denied', 'Halo', 'A key press that does nothing (cooldown, nothing in range, no plumes)', '', 'Keys 1, 2, 4 refused', 'nokey', 1),
  S('halo.warnings_on', 'Halo', 'Dead-zone warnings switched on', '', 'Key 3', 'upgrade', 1),
  S('halo.warnings_off', 'Halo', 'Dead-zone warnings switched off', '', 'Key 3', 'nokey', 1),
  // ---- cinematics ----
  S('cine.rift.strike', 'Cinematic 1: the Rift', 'Lightning strike (thunder) tearing open the rift', '', 'Start of the Rift cinematic', 'overload', 3),
  S('cine.rift.open', 'Cinematic 1: the Rift', 'The rift opens and writhes (low hum)', '', 'About 1.5 s into the Rift', null, 6, true),
  S('cine.rift.snap', 'Cinematic 1: the Rift', 'The camera snaps back to the avatar', '', 'End of the Rift', null, 1),
  S('cine.aurora.ambient', 'Cinematic 2: the aurora', 'Aurora ambience: a shimmering, rippling bed under the night sky', '', 'Whole of the aurora cinematic (20 s)', null, 20, true),
  S('cine.aurora.synth_change', 'Cinematic 2: the aurora', "Cue for the Synth's visible look change", '', 'The Synth republishes its look', null, 3),
  S('cine.carrington.storm', 'Cinematic 3: Carrington', 'Geomagnetic storm: roaring, crackling', '', 'Start of the Carrington event', 'crackle', 12, true),
  S('cine.carrington.crackle', 'Cinematic 3: Carrington', 'Bursts of crackle on the halo while the city strobes', '', 'Random bursts during the storm', 'crackle', 1),
  S('cine.carrington.ignite', 'Cinematic 3: Carrington', 'The sky ignites: the hand-off to the endgame', '', 'End of the storm', null, 3),
  // ---- the ending ----
  S('end.plume.rise', 'The ending', 'The endgame plume rises (dark smoke crackling with energy)', '', 'The endgame point appears', null, 8, true),
  S('end.portal.escape.open', 'The ending', 'Yellow portal (Escape) opens', '', 'Ending 1 begins', null, 4, true),
  S('end.portal.contain.open', 'The ending', 'Purple portal (Containment) opens', '', 'Ending 2 begins', null, 4, true),
  S('end.portal.escape.line', 'The ending', 'The Synth, to the players, as they fly through the yellow portal', 'Follow me.', 'Ending 1: the players follow the Synth', 'escape', 3),
  S('end.portal.contain.line', 'The ending', 'The Synth, as it is pulled into the purple portal', 'Please no!', 'Ending 2: all players arrive', 'contain', 3),
  S('end.portal.contain.pull', 'The ending', 'The Synth is sucked into the portal and disappears', '', 'Ending 2, after the line', null, 4)
]

/** The file a slot is recorded to. */
export const fileFor = (id: string) => id.replace(/\./g, '_') + '.wav'
export const slotIds = () => SLOTS.map((s) => s.id)
