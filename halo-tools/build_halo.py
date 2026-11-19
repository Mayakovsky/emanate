# Build the halo zip for a given game server without committing the address (round 15).
# usage: EMANATE_HALO_SERVER=https://<name> python halo-tools/build_halo.py   (default: the local dev server, http://127.0.0.1:8787)
# It writes halo-build04/src/server-url.ts, builds and packs, then restores the committed default so nothing real is left in the tree.
import os, subprocess, sys, hashlib
HB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'halo-build04')
URL = os.environ.get('EMANATE_HALO_SERVER', 'http://127.0.0.1:8787')
F = os.path.join(HB, 'src', 'server-url.ts')
orig = open(F, encoding='utf8').read()
try:
    open(F, 'w', encoding='utf8', newline='\n').write("export const SERVER_URL = '" + URL + "'\n")
    for cmd in (['npm', 'run', 'build'], ['npm', 'run', 'pack']):
        r = subprocess.run(cmd, cwd=HB, shell=(os.name == 'nt'))
        if r.returncode: sys.exit('failed: ' + ' '.join(cmd))
finally:
    open(F, 'w', encoding='utf8', newline='\n').write(orig)
z = os.path.join(HB, 'smart-wearable.zip')
b = open(z, 'rb').read()
# c25: fail the build if any named particle texture is absent from the zip (same list as validate_zip.py)
import zipfile
_names = set(zipfile.ZipFile(z).namelist())
_missing = [t for t in ['puff', 'wisp', 'flame', 'spark', 'ring', 'flipbook'] if 'images/' + t + '.png' not in _names]
if _missing: sys.exit('build failed: texture(s) missing from the zip: ' + ', '.join(_missing))
print('zip', len(b), 'bytes sha256', hashlib.sha256(b).hexdigest())
