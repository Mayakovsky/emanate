// Round 24 (c24i): pure UI decisions, testable without the SDK.
/** What the replay menu ("THE ENDING IS OVER") must do for the server's match state. It is open ONLY while the match is 'ended': any other state (a new lobby after a server reset, a round, a restart's first answer) closes it. c24h only closed it on 'playing', so a reset into 'lobby' left it stuck. */
export function replayMenuAction(matchState: string | undefined, menuOpen: boolean): 'open' | 'close' | 'none' {
  if (matchState === 'ended') return menuOpen ? 'none' : 'open'
  if (matchState === undefined) return 'none' // no answer yet: change nothing
  return menuOpen ? 'close' : 'none'
}
/** The stage cues: a short plain-English line per stage, from the server's changeable text. event -> text key. */
export const CUE_BY_EVENT: Record<string, string> = { lobby: 'cueLobby', 'round-start': 'cueRound', endgame: 'cueEnding' }
export function cueKeyFor(ev: string): string | null { return CUE_BY_EVENT[ev] ?? null }
