// Where the server gets the Synth's position: the Bevy headless Synth's stdout log (@synth {"event":"position",...}),
// tailed through WSL, or a simulated moving point for tests without the Synth.
import { spawn, type ChildProcess } from 'node:child_process'
import type { Vec } from './geo.ts'

// round 22: on Windows the Synth lives in WSL (wsl.exe -e bash); on a Linux host (the rented box) it is local bash
const IS_WIN = process.platform === 'win32'
export const bashCmd = (args: string[]): [string, string[]] => (IS_WIN ? ['wsl.exe', ['-e', 'bash', ...args]] : ['bash', args])

export function parseSynthLine(line: string): Vec | null {
  const i = line.indexOf('@synth ')
  if (i < 0) return null
  try {
    const ev = JSON.parse(line.slice(i + 7))
    if (ev.event === 'position' && Array.isArray(ev.position)) return { x: ev.position[0], y: ev.position[1], z: ev.position[2] }
  } catch {}
  return null
}

export function parseSynthEvent(line: string): any | null {
  const i = line.indexOf('@synth ')
  if (i < 0) return null
  try {
    return JSON.parse(line.slice(i + 7))
  } catch {
    return null
  }
}

export function tailWslSynth(onPos: (p: Vec) => void, logPath = '~/synth.log', onEvent?: (ev: any) => void): ChildProcess {
  const child = spawn(...bashCmd(['-c', `tail -n 0 -F ${logPath}`]), { stdio: ['ignore', 'pipe', 'ignore'] })
  let buf = ''
  child.stdout!.on('data', (d: Buffer) => {
    buf += d.toString('utf8')
    let n
    while ((n = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, n)
      buf = buf.slice(n + 1)
      const p = parseSynthLine(line)
      if (p) onPos(p)
      if (onEvent) {
        const ev = parseSynthEvent(line)
        if (ev && ev.event !== 'position') onEvent(ev)
      }
    }
  })
  return child
}

// A Synth stand-in that walks a circle (radius r, speed m/s) around a centre.
export function simSynth(onPos: (p: Vec) => void, centre: Vec, r = 60, speed = 8): NodeJS.Timeout {
  let a = 0
  return setInterval(() => {
    a += (speed / r) * 0.2
    onPos({ x: centre.x + Math.cos(a) * r, y: centre.y, z: centre.z + Math.sin(a) * r })
  }, 200)
}

// Commands to the real Synth (stdin fifo in WSL). One persistent `wsl.exe bash` is kept open and fed lines: spawning a wsl.exe per command
// exhausted WSL's socket buffers (WSAENOBUFS) during long tests. The write is backgrounded so a fifo with no reader cannot block the shell.
let sh: ChildProcess | null = null
function shell(): ChildProcess {
  if (!sh || sh.exitCode !== null || sh.killed) {
    sh = spawn(...bashCmd([]), { stdio: ['pipe', 'ignore', 'ignore'] })
    sh.on('exit', () => { sh = null })
    sh.stdin!.on('error', () => {})
  }
  return sh
}
// Remote mode (EMANATE_SYNTH=bridge): the game server is not on the Synth's machine, so commands for the Synth queue up for the bridge to fetch
// instead of being written to the local FIFO. null = local FIFO.
let transport: ((cmd: object) => void) | null = null
export function setSynthTransport(fn: ((cmd: object) => void) | null) {
  transport = fn
}
export function sendSynthCommand(cmd: object, fifo = '~/synth.in') {
  if (transport && fifo === '~/synth.in') return transport(cmd)
  const json = JSON.stringify(cmd).replace(/'/g, '')
  // round 22: a write to a pipe nobody reads blocks forever: it is killed after 3 s so blocked writes never pile up (the watchdog counts the position silence as the freeze)
  shell().stdin!.write(['( echo \'' + json + '\' > ' + fifo + ' ) & W=$!; ( sleep 3; kill $W 2>/dev/null ) &', ''].join(String.fromCharCode(10)))
}
