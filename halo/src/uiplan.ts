// Round 24 (c24i): pure UI decisions, testable without the SDK. (c30: the replay menu is gone: the replay is two portals in the world)
/** The stage cues: a short plain-English line per stage, from the server's changeable text. event -> text key. */
export const CUE_BY_EVENT: Record<string, string> = { lobby: 'cueLobby', 'round-start': 'cueRound', ending: 'cueEnding' } // c30: the ending is the winner's portal, the Storm and the two replay portals (no menu, no marked spot)
export function cueKeyFor(ev: string): string | null { return CUE_BY_EVENT[ev] ?? null }
