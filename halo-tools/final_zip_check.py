# Final-build pre-gate check (readiness list steps 2, 6, 7, 13, 14). Read-only; no secrets.
# usage: python final_zip_check.py <zip> [halo-source-dir]   (source dir defaults to ..\halo-build04)
import sys, os, re, zipfile
z = zipfile.ZipFile(sys.argv[1]); src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'halo-build04')
res = []
def chk(name, ok, detail=''): res.append(ok); print(('PASS ' if ok else 'FAIL ') + name + (' : ' + str(detail) if detail else ''))
zb = os.path.getsize(sys.argv[1]); ub = sum(i.file_size for i in z.infolist())
chk('zipped size under 2.7 MB', zb < 2.7e6, zb); chk('unzipped size under 3.00 MB (Builder limit)', ub < 3.0e6, ub)
js = z.read('bin/game.js').decode('utf8', 'ignore')
chk('public server address present', 'https://emanate.hiddenforces.net' in js)
chk('no local test address in the bundle', '127.0.0.1' not in js and 'localhost' not in js)
chk('no probe code (step 2)', not re.search(r'probeRun|probeTick|PROBE|halo-probe', js))
chk('wearable.json present', 'wearable.json' in z.namelist())
sj = z.read('scene.json').decode('utf8', 'ignore')
chk('scene.json asks only USE_FETCH', 'USE_FETCH' in sj and 'USE_WEBSOCKET' not in sj, re.findall(r'USE_[A-Z_]+', sj))
try:
    st = open(os.path.join(src, 'src', 'settings.ts'), encoding='utf8').read()
    m = re.search(r'export const FINAL_NO_TEST_POWERS\s*=\s*(true|false)', st)
    chk('FINAL_NO_TEST_POWERS is true in the source (step 13; the flag name is minified out of the zip)', bool(m) and m.group(1) == 'true', m.group(1) if m else 'not found')
except OSError as e: chk('settings.ts readable', False, e)
try:   # Directive Y item 5: the test-only trace upload must sit behind the same flag
    gs = open(os.path.join(src, 'src', 'game.ts'), encoding='utf8').read()
    chk('trace upload gated by FINAL_NO_TEST_POWERS (no diagnostics sent from the final build)', bool(re.search(r"!FINAL_NO_TEST_POWERS\)\s*sendGameEvent\(\{\s*ev:\s*'trace'", gs)))
except OSError as e: chk('game.ts readable', False, e)
print('INFO step 14 (the crack file from Forces): cannot be verified by name; slot blast.crack is a placeholder (crackle tone) until the file is supplied; confirm by hand against the zip listing')
print('ALL PASS' if all(res) else 'NOT READY: %d failing' % res.count(False)); sys.exit(0 if all(res) else 1)
