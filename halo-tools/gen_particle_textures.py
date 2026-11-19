# Round 24 (c24g): the particle texture set. White on alpha (colour comes from the server's emitter colour), 64x64 grey+alpha PNGs, each under 4 KB. Deterministic (fixed seeds).
import zlib, struct, math, random, os, sys
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'assets')
W = 64
def png(path, alpha):  # alpha: W*W floats 0..1 -> grey(255)+alpha PNG
    raw = b''
    for y in range(W):
        raw += b'\x00' + b''.join(bytes([255, max(0, min(255, int(round(255 * alpha[y * W + x]))))]) for x in range(W))
    def ch(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', W, W, 8, 4, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw, 9)) + ch(b'IEND', b'')
    open(path, 'wb').write(data); return len(data)
sm = lambda a: a * a * (3 - 2 * a)
def puff():
    return [sm(max(0, 1 - math.hypot(x - 31.5, y - 31.5) / 31.5)) for y in range(W) for x in range(W)]
def noise(seed, n=6):  # smooth value noise 0..1
    r = random.Random(seed); g = [[r.random() for _ in range(n + 1)] for _ in range(n + 1)]
    def f(u, v):
        x, y = min(u, 0.9999) * n, min(v, 0.9999) * n; i, j = int(x), int(y); fx, fy = sm(x - i), sm(y - j)
        a = g[j][i] * (1 - fx) + g[j][i + 1] * fx; b = g[j + 1][i] * (1 - fx) + g[j + 1][i + 1] * fx
        return a * (1 - fy) + b * fy
    return f
def wisp():  # an irregular, streaky smoke wisp: a soft blob whose edge is eaten by noise, quantised to 12 levels (smaller file)
    n1, n2 = noise(11, 5), noise(23, 9); out = []
    for y in range(W):
        for x in range(W):
            u, v = x / (W - 1), y / (W - 1); d = math.hypot(x - 31.5, (y - 31.5) * 0.85) / 31.5
            a = max(0, 1 - d) ** 1.3 * (0.35 + 0.9 * n1(u, v)) * (0.6 + 0.6 * n2(u, v)); a = min(1, a * 1.5)
            out.append(round(sm(a) * 12) / 12)
    return out
def flame():  # a tall tongue: wide at the bottom, a pointed top, a brighter core
    out = []
    for y in range(W):
        t = y / (W - 1)  # 0 = top, 1 = bottom
        half = (0.04 + 0.42 * math.sin(min(1, t * 1.15) * math.pi * 0.55) ** 1.4) * 64 * (0.5 + 0.5 * t)
        for x in range(W):
            dx = abs(x - 31.5)
            a = max(0, 1 - dx / max(half, 0.5)); a = sm(a) * (1 - 0.35 * (1 - t) ** 3) * min(1, (1 - t) * 6 + 0.1) if half > 0.5 else 0
            out.append(round(max(0, min(1, a)) * 12) / 12)
    return out
def spark():  # a tight, bright core with a quick falloff and a faint four-point star
    out = []
    for y in range(W):
        for x in range(W):
            dx, dy = x - 31.5, y - 31.5; d = math.hypot(dx, dy) / 31.5
            core = max(0, 1 - d * 3.2) ** 1.5; halo = max(0, 1 - d) ** 3 * 0.45
            star = max(0, 1 - abs(dx) / 31.5) ** 8 * max(0, 1 - abs(dy) / 2.2) + max(0, 1 - abs(dy) / 31.5) ** 8 * max(0, 1 - abs(dx) / 2.2)
            out.append(round(min(1, core + halo + 0.5 * star) * 12) / 12)
    return out
def ring():  # a soft ring / streak ring
    return [round(sm(max(0, 1 - abs(math.hypot(x - 31.5, y - 31.5) - 23) / 6.5)) * 12) / 12 for y in range(W) for x in range(W)]
def flipbook():  # a 4x4 flipbook of 16 flame frames (each 16x16 in a 64x64 sheet): a flickering tongue; frame i sways and changes height
    out = [0.0] * (W * W)
    for fi in range(16):
        r, c = divmod(fi, 4); ph = fi / 16 * math.tau
        for y in range(16):
            for x in range(16):
                t = y / 15; sway = math.sin(ph + t * 2.2) * 1.6 * (1 - t) ** 0.5; h = 0.82 + 0.18 * math.sin(ph * 2 + 1)
                half = (0.5 + 5.6 * math.sin(min(1, (t - (1 - h)) / h) * math.pi * 0.55) ** 1.3) if t > 1 - h else 0
                dx = abs(x - 7.5 - sway); a = sm(max(0, 1 - dx / max(half, 0.5))) if half > 0.5 else 0
                out[(r * 16 + y) * W + c * 16 + x] = round(a * 8) / 8
    return out
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True); tot = 0
    for name, fn in (('puff', puff), ('wisp', wisp), ('flame', flame), ('spark', spark), ('ring', ring), ('flipbook', flipbook)):
        n = png(os.path.join(OUT, name + '.png'), fn()); tot += n; print(name, n, 'bytes', 'OK' if n < 4096 else 'OVER 4 KB')
    print('total', tot)
