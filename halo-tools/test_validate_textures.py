"""Unit test: the validator fails when a named particle texture is absent from the zip, and passes when all six are there.
Run: python halo-tools/test_validate_textures.py   (uses halo-upload/smart-wearable-c25-candidate.zip or the path in argv[1])"""
import os, subprocess, sys, tempfile, zipfile
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'halo-upload', 'smart-wearable-c25-candidate.zip')
def run(zp):
    r = subprocess.run([sys.executable, os.path.join(HERE, 'validate_zip.py'), zp], capture_output=True, text=True)
    return r.returncode, r.stdout
def clone(skip):
    out = os.path.join(tempfile.mkdtemp(), 'v.zip')
    with zipfile.ZipFile(SRC) as zi, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zo:
        for i in zi.infolist():
            if i.filename != skip: zo.writestr(i, zi.read(i.filename))
    return out
rc, out = run(SRC); assert rc == 0, 'the full zip must pass: ' + out[-300:]
for t in ['puff', 'wisp', 'flame', 'spark', 'ring', 'flipbook']:
    rc, out = run(clone('images/' + t + '.png')); assert rc != 0 and 'all six named particle textures' in out, 'missing ' + t + ' must fail'
print('ok: full zip passes; each of the six textures removed makes the validator fail')
