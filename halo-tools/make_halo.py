#!/usr/bin/env python3
"""Build halo.glb: the template's skeleton/skin kept intact, the glasses mesh replaced by a
low-poly halo ring (torus) weighted 100% to Avatar_Head, one flat-colour material, no textures."""
import json, math, struct, sys, zlib

SRC = sys.argv[1]  # template glb (glasses.glb at the repo's first commit)
OUT = sys.argv[2]

d = open(SRC, 'rb').read()
off = 12; ch = []
while off < len(d):
    clen, ctype = struct.unpack('<I4s', d[off:off + 8]); ch.append((ctype, d[off + 8:off + 8 + clen])); off += 8 + clen
j = json.loads(ch[0][1]); oldbin = ch[1][1]

# inverse bind matrices come from the template (accessor 6 -> bufferView 6)
bv6 = j['bufferViews'][j['accessors'][6]['bufferView']]
ibm = oldbin[bv6['byteOffset']:bv6['byteOffset'] + bv6['byteLength']]
HEAD_JOINT = j['skins'][0]['joints'].index(56)  # Avatar_Head

# ---- ring geometry (avatar space, metres; y up, z forward) ----
MAJOR, MINOR = 16, 6
R, r = 0.17, 0.016
CX, CY, CZ = 0.0, 1.95, 0.02
pos, nor, uv = [], [], []
for i in range(MAJOR):
    u = 2 * math.pi * i / MAJOR
    for k in range(MINOR):
        v = 2 * math.pi * k / MINOR
        cu, su, cv, sv = math.cos(u), math.sin(u), math.cos(v), math.sin(v)
        pos.append(((R + r * cv) * cu + CX, r * sv + CY, (R + r * cv) * su + CZ))
        nor.append((cv * cu, sv, cv * su))
        uv.append((i / MAJOR, k / MINOR))
idx = []
for i in range(MAJOR):
    for k in range(MINOR):
        a = i * MINOR + k
        b = ((i + 1) % MAJOR) * MINOR + k
        c = ((i + 1) % MAJOR) * MINOR + (k + 1) % MINOR
        e = i * MINOR + (k + 1) % MINOR
        for tri in ((a, b, c), (a, c, e)):
            # outward winding: geometric normal must agree with the vertex normal
            p0, p1, p2 = (pos[t] for t in tri)
            ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
            vx, vy, vz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
            gn = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
            n0 = nor[tri[0]]
            if gn[0] * n0[0] + gn[1] * n0[1] + gn[2] * n0[2] < 0:
                tri = (tri[0], tri[2], tri[1])
            idx.extend(tri)
nv, ni = len(pos), len(idx)

def pack(fmt, rows):
    return b''.join(struct.pack(fmt, *r) for r in rows)

def pad4(b):
    return b + b'\x00' * ((-len(b)) % 4)

blobs = []  # (bytes, byteStride|None, target|None)
blobs.append((pack('<3f', pos), 12, 34962))                       # 0 POSITION
blobs.append((pack('<3f', nor), 12, 34962))                       # 1 NORMAL
blobs.append((pack('<2f', uv), 8, 34962))                         # 2 TEXCOORD_0
blobs.append((pack('<4H', [(HEAD_JOINT, 0, 0, 0)] * nv), 8, 34962))  # 3 JOINTS_0
blobs.append((pack('<4f', [(1.0, 0.0, 0.0, 0.0)] * nv), 16, 34962))  # 4 WEIGHTS_0
blobs.append((pack('<%dH' % ni, [(x,) for x in idx]) if False else struct.pack('<%dH' % ni, *idx), None, 34963))  # 5 indices
blobs.append((ibm, None, None))                                   # 6 inverse bind matrices

binb = bytearray(); views = []
for data, stride, target in blobs:
    start = len(binb); binb += data
    bvw = {'buffer': 0, 'byteOffset': start, 'byteLength': len(data)}
    if stride: bvw['byteStride'] = stride
    if target: bvw['target'] = target
    views.append(bvw)
    while len(binb) % 4: binb.append(0)

xs = [p[0] for p in pos]; ys = [p[1] for p in pos]; zs = [p[2] for p in pos]
j['bufferViews'] = views
j['accessors'] = [
    {'bufferView': 0, 'componentType': 5126, 'count': nv, 'type': 'VEC3', 'min': [min(xs), min(ys), min(zs)], 'max': [max(xs), max(ys), max(zs)]},
    {'bufferView': 1, 'componentType': 5126, 'count': nv, 'type': 'VEC3'},
    {'bufferView': 2, 'componentType': 5126, 'count': nv, 'type': 'VEC2'},
    {'bufferView': 3, 'componentType': 5123, 'count': nv, 'type': 'VEC4'},
    {'bufferView': 4, 'componentType': 5126, 'count': nv, 'type': 'VEC4'},
    {'bufferView': 5, 'componentType': 5123, 'count': ni, 'type': 'SCALAR'},
    {'bufferView': 6, 'componentType': 5126, 'count': 62, 'type': 'MAT4'},
]
j['buffers'] = [{'name': 'buffer', 'byteLength': len(binb)}]
j['meshes'] = [{'name': 'Halo', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2, 'JOINTS_0': 3, 'WEIGHTS_0': 4}, 'indices': 5, 'material': 0}]}]
j['materials'] = [{'doubleSided': True, 'name': 'AvatarWearable_MAT',
                   'pbrMetallicRoughness': {'baseColorFactor': [1.0, 0.82, 0.25, 1.0], 'metallicFactor': 0, 'roughnessFactor': 1},
                   'emissiveFactor': [0, 0, 0], 'alphaMode': 'OPAQUE'}]
j.pop('textures', None); j.pop('images', None); j.pop('samplers', None)
for n in j['nodes']:
    if n.get('mesh') == 0: n['name'] = 'Halo'

js = json.dumps(j, separators=(',', ':')).encode()
js += b' ' * ((-len(js)) % 4)
out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binb), b'BIN\x00') + bytes(binb)
open(OUT, 'wb').write(out)
print('halo.glb', len(out), 'bytes;', nv, 'vertices,', ni // 3, 'triangles; head joint', HEAD_JOINT)
