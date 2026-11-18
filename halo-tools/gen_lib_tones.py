# Round 23: the halo's sound library: original generated tones (sine / triangle / noise with envelopes), no third-party material.
# usage: python halo-tools/gen_lib_tones.py   -> halo-build04/audio/<name>.wav (mono 16-bit 22.05 kHz)
import math, random, struct, wave, os
SR = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'halo-build04', 'audio')
random.seed(23)
def env(t, dur, a=0.01, r=0.12):
    if t < a: return t / a
    if t > dur - r: return max(0.0, (dur - t) / r)
    return 1.0
def tone(segs, dur, wave_kind='sine', vib=0.0, noise=0.0, gain=0.5):
    # segs: list of (t0, t1, f0, f1)
    n = int(SR * dur); out = []; ph = 0.0
    for i in range(n):
        t = i / SR; f = 0
        for (t0, t1, f0, f1) in segs:
            if t0 <= t < t1: f = f0 + (f1 - f0) * (t - t0) / max(1e-6, t1 - t0); break
        f *= 1 + vib * math.sin(2 * math.pi * 6 * t)
        ph += 2 * math.pi * f / SR
        if wave_kind == 'sine': v = math.sin(ph)
        elif wave_kind == 'tri': v = 2 / math.pi * math.asin(math.sin(ph))
        elif wave_kind == 'square': v = 1.0 if math.sin(ph) > 0 else -1.0
        else: v = math.sin(ph)
        if f == 0: v = 0
        v = v * (1 - noise) + (random.random() * 2 - 1) * noise
        out.append(v * env(t, dur) * gain)
    return out
def write(name, samples):
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32000)) for s in samples))
os.makedirs(OUT, exist_ok=True)
def seq(notes, kind='sine', gain=0.5, vib=0.0, noise=0.0):
    t = 0.0; segs = []
    for f, d in notes: segs.append((t, t + d, f, f)); t += d
    return tone(segs, t, kind, vib, noise, gain)
LIB = {
 'cue_event':       seq([(660, .12), (880, .16)]),
 'cue_good':        seq([(523, .1), (659, .1), (784, .22)], 'tri'),
 'cue_bad':         seq([(392, .14), (294, .26)], 'square', 0.3),
 'cue_warn':        seq([(880, .12), (0, .06), (880, .12)], 'square', 0.3),
 'cue_alert':       tone([(0, .25, 600, 1100), (.25, .5, 1100, 600)], .5, 'tri', 0.02, 0, .5),
 'cue_round_start': seq([(392, .12), (523, .12), (659, .12), (784, .3)], 'tri'),
 'cue_round_end':   seq([(784, .14), (659, .14), (523, .14), (392, .36)], 'tri'),
 'cue_charge_a':    tone([(0, .5, 200, 600)], .5, 'sine', .03),
 'cue_charge_b':    tone([(0, .5, 300, 900)], .5, 'tri', .03),
 'cue_charge_c':    tone([(0, .6, 400, 1200)], .6, 'sine', .05, .08),
 'cue_lobby':       seq([(440, .2), (554, .2), (659, .2), (554, .2)], 'sine', 0.4),
 'cue_burst':       tone([(0, .6, 900, 80)], .6, 'sine', 0, .55, .6),
 'cue_rift':        tone([(0, .8, 120, 60), ], .8, 'tri', .08, .25, .6),
 'cue_plume':       tone([(0, .5, 300, 200)], .5, 'sine', .02, .45, .5),
 'cue_trap':        tone([(0, .12, 1000, 400), (.12, .3, 400, 100)], .3, 'square', 0, .1, .4),
 'cue_pickup':      seq([(784, .07), (988, .07), (1319, .16)], 'tri'),
 'cue_power_up':    tone([(0, .4, 300, 1000)], .4, 'tri', 0, 0, .5),
 'cue_power_down':  tone([(0, .4, 1000, 300)], .4, 'tri', 0, 0, .5),
 'cue_glide':       tone([(0, .7, 500, 520)], .7, 'sine', .02, .12, .35),
 'cue_lift':        tone([(0, .8, 150, 700)], .8, 'sine', .01, .1, .45),
 'cue_teleport':    seq([(1200, .05), (300, .05), (1500, .05), (200, .12)], 'tri', 0.4),
 'cue_tick':        seq([(1500, .03)], 'sine', .4),
 'cue_low':         seq([(220, .3)], 'sine', .5),
 'cue_high':        seq([(1320, .2)], 'sine', .4),
}
for i in range(1, 9):
    f0 = 300 + 90 * i
    LIB['spare_%02d' % i] = tone([(0, .25, f0, f0 * 1.5), (.25, .5, f0 * 1.5, f0)], .5, ['sine', 'tri'][i % 2], .02 * (i % 3), 0, .4)
tot = 0
for k, v in LIB.items():
    write(k, v); tot += len(v) * 2 + 44
print(len(LIB), 'tones,', tot // 1024, 'KB')
