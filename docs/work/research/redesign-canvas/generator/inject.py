import sys, pathlib
common = pathlib.Path(__file__).with_name('common.css').read_text().strip()
for p in sys.argv[1:]:
    f = pathlib.Path(p); s = f.read_text()
    if '/*COMMON*/' in s:
        f.write_text(s.replace('/*COMMON*/', common)); print('injected', f.name)
