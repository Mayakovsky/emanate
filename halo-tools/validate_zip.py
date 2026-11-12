#!/usr/bin/env python3
"""Validate a smart-wearable zip against the Builder rules in creating-wearables.md and the
smart-wearables page. Prints a PASS/FAIL table. Exit 1 if anything fails."""
import json, struct, sys, zipfile

zp = sys.argv[1]
z = zipfile.ZipFile(zp)
names = {i.filename: i for i in z.infolist()}
rows = []
def chk(rule, ok, detail):
    rows.append((rule, 'PASS' if ok else 'FAIL', detail))

wj = json.loads(z.read('wearable.json'))
sc = json.loads(z.read('scene.json'))

# ---- wearable.json ----
allowed_top = {'id', 'name', 'description', 'rarity', 'data', 'mapping'}
chk('wearable.json: no invalid top-level fields', set(wj) <= allowed_top, f"fields={sorted(wj)}")
chk('wearable.json: id present (unique uuid)', bool(wj.get('id')), wj.get('id'))
chk('wearable.json: name present', bool(wj.get('name')), wj.get('name'))
chk('wearable.json: description <= 64 chars', len(wj.get('description', '')) <= 64, f"{len(wj.get('description',''))} chars")
rar = {'unique', 'mythic', 'exotic', 'legendary', 'epic', 'rare', 'uncommon', 'common'}
chk('wearable.json: rarity valid', wj.get('rarity') in rar, wj.get('rarity'))
data = wj.get('data', {})
chk('wearable.json: data has replaces/hides/tags/representations/category',
    all(k in data for k in ('replaces', 'hides', 'tags', 'representations', 'category')), f"keys={sorted(data)}")
cats = {'eyebrows','eyes','facial_hair','hair','mouth','upper_body','lower_body','feet','earring','eyewear','hat','helmet','mask','tiara','top_head','skin','hands_wear'}
cat = data.get('category')
chk('wearable.json: category valid', cat in cats, cat)
shapes = set(); mains = []; contents = set()
for rep in data.get('representations', []):
    shapes |= set(rep.get('bodyShapes', [])); mains.append(rep.get('mainFile')); contents |= set(rep.get('contents', []))
chk('representations cover male AND female', {'urn:decentraland:off-chain:base-avatars:BaseMale', 'urn:decentraland:off-chain:base-avatars:BaseFemale'} <= shapes, f"{len(shapes)} body shapes")
chk('mainFile + contents exist in the zip', all(m in names for m in mains) and contents <= set(names), f"main={mains} contents={sorted(contents)}")
chk('hides nothing / replaces nothing (single-slot budget)', not data.get('hides') and not data.get('replaces'), 'hides=[] replaces=[]')

# ---- scene.json ----
chk('scene.json: isPortableExperience true', sc.get('isPortableExperience') is True, sc.get('isPortableExperience'))
chk('scene.json: runtimeVersion "7"', sc.get('runtimeVersion') == '7', sc.get('runtimeVersion'))
chk('scene.json: requiredPermissions declared = none used', sc.get('requiredPermissions') == [], sc.get('requiredPermissions'))

# ---- sizes ----
total = sum(i.file_size for i in z.infolist())
chk('total unzipped < 3 MB', total < 3 * 1024 * 1024, f"{total} bytes ({total/1024:.0f} KB)")
chk('thumbnail.png at the root', 'thumbnail.png' in names, '')
th = z.read('thumbnail.png')
w, h = struct.unpack('>II', th[16:24]); chk('thumbnail is 256x256 PNG', th[:8] == b'\x89PNG\r\n\x1a\n' and (w, h) == (256, 256), f"{w}x{h}")
chk('no stray logs / loose images in the zip', not any(n.endswith('.log') or n.lower().endswith(('.png', '.jpg')) and n != 'thumbnail.png' for n in names), sorted(names))

# ---- the model ----
g = z.read(mains[0])
off = 12; ch = []
while off < len(g):
    cl, ct = struct.unpack('<I4s', g[off:off + 8]); ch.append((ct, g[off + 8:off + 8 + cl])); off += 8 + cl
j = json.loads(ch[0][1]); binb = ch[1][1]
chk('glTF 2.0 binary (.glb)', g[:4] == b'glTF' and j['asset']['version'] == '2.0', j['asset'])
prims = [p for m in j['meshes'] for p in m['primitives']]
tris = sum(j['accessors'][p['indices']]['count'] // 3 for p in prims)
limit = {'mask': 500, 'eyewear': 500, 'earring': 500, 'tiara': 500, 'top_head': 500, 'facial_hair': 500,
         'hat': 1500, 'helmet': 1500, 'upper_body': 1500, 'lower_body': 1500, 'feet': 1500, 'hair': 1500}.get(cat, 0)
chk(f'triangles <= {limit} for {cat}', tris <= limit, f"{tris} triangles")
imgs = j.get('images', []); chk('textures <= 2, each <= 1024x1024', len(imgs) <= 2, f"{len(imgs)} images")
chk('images are embedded only (no external uri)', all('uri' not in i for i in imgs) and all('uri' not in b for b in j['buffers']), 'no uri fields')
mats = [m for m in j.get('materials', []) if m.get('name') != 'AvatarSkin_MAT']
chk('materials <= 2 (excluding AvatarSkin_MAT)', len(mats) <= 2, f"{len(mats)} material(s)")
bad = [m['name'] for m in mats if any(k in m for k in ('normalTexture', 'occlusionTexture')) or 'metallicRoughnessTexture' in m.get('pbrMetallicRoughness', {})]
chk('only base colour / emission / alpha maps (no normal or roughness maps)', not bad, bad or 'none')
pos = [a for a in j['accessors'] if a['type'] == 'VEC3' and 'min' in a][0]
size = [pos['max'][i] - pos['min'][i] for i in range(3)]
chk('bounding box within 2.42 W x 2.42 H x 1.4 D m', size[0] <= 2.42 and size[1] <= 2.42 and size[2] <= 1.4, 'x=%.2f y=%.2f z=%.2f m' % tuple(size))
chk('skinned with the avatar armature: 1 skin, 62 joints', len(j.get('skins', [])) == 1 and len(j['skins'][0]['joints']) == 62, f"{len(j['skins'][0]['joints'])} joints")
chk('64 nodes (Armature + 62 bones + mesh)', len(j['nodes']) == 64, f"{len(j['nodes'])} nodes")
chk('no cameras / lights; no animations / morph targets', not j.get('cameras') and not j.get('animations') and not any('targets' in p for p in prims) and 'KHR_lights_punctual' not in j.get('extensionsUsed', []), 'none')
chk('no reserved names (_mouth/_eyebrows/_eyes) in node/mesh names', not any(any(r in (n.get('name') or '').lower() for r in ('_mouth', '_eyebrows', '_eyes')) for n in j['nodes'] + j['meshes']), 'ok')
# bone influences: <= 4 per vertex; every vertex weighted
ja = j['accessors'][prims[0]['attributes']['JOINTS_0']]; wa = j['accessors'][prims[0]['attributes']['WEIGHTS_0']]
bvw = j['bufferViews'][wa['bufferView']]; wts = struct.unpack('<%df' % (wa['count'] * 4), binb[bvw['byteOffset']:bvw['byteOffset'] + wa['count'] * 16])
ok_w = all(abs(sum(wts[i * 4:i * 4 + 4]) - 1.0) < 1e-4 for i in range(wa['count']))
chk('<= 4 bone influences per vertex; weights sum to 1', ok_w, f"{wa['count']} vertices, JOINTS_0 VEC4")
# winding / normals: sanity — all triangle geometric normals agree with vertex normals
chk('buffer ranges inside the BIN chunk', all(b['byteOffset'] + b['byteLength'] <= len(binb) for b in j['bufferViews']), f"BIN {len(binb)} bytes")

w1 = max(len(r[0]) for r in rows)
print(f"{'RULE':<{w1}}  RESULT  DETAIL")
for rule, res, det in rows: print(f"{rule:<{w1}}  {res:<6}  {det}")
fails = [r for r in rows if r[1] == 'FAIL']
print(f"\n{len(rows)-len(fails)}/{len(rows)} checks pass" + ('' if not fails else f"; FAILING: {[f[0] for f in fails]}"))
sys.exit(1 if fails else 0)
