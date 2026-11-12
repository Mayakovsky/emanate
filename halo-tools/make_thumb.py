#!/usr/bin/env python3
"""256x256 transparent PNG of a gold halo ring (pure Python, no imaging library)."""
import math, struct, sys, zlib

W = H = 256
rows = []
for y in range(H):
    row = bytearray([0])  # filter byte
    for x in range(W):
        # tilted ring: ellipse in screen space
        dx, dy = (x - 128) / 100.0, (y - 128) / 34.0
        d = math.hypot(dx, dy)
        a = max(0.0, min(1.0, (0.13 - abs(d - 1.0)) / 0.04))  # soft edge, ring width ~0.13
        row += bytes((255, 210, 64, int(255 * a)))
    rows.append(bytes(row))
raw = b''.join(rows)

def chunk(t, data):
    c = struct.pack('>I', len(data)) + t + data
    return c + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)

png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
open(sys.argv[1], 'wb').write(png)
print('thumbnail', len(png), 'bytes')
