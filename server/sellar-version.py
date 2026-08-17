import pathlib, json, re, sys
d = sys.argv[1]
raiz = pathlib.Path(d)
ver = json.loads((raiz/'package.json').read_text())['version']

# Sello de versión en cada enlace a CSS y JS
n = 0
for f in (raiz/'public').glob('*.html'):
    s = f.read_text()
    orig = s
    s = re.sub(r'(href="/assets/css/[^"?]+)(\?v=[^"]*)?"', rf'\1?v={ver}"', s)
    s = re.sub(r'(src="/assets/js/[^"?]+)(\?v=[^"]*)?"', rf'\1?v={ver}"', s)
    if s != orig:
        f.write_text(s); n += 1
print(f'  {n} páginas con la versión {ver} en sus enlaces')
