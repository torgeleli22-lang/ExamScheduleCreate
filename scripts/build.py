"""src/template.html 에 data/seed.json 을 넣어 index.html 을 만든다.
사용: python3 scripts/build.py"""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
t = (root / 'src/template.html').read_text(encoding='utf-8')
s = (root / 'data/seed.json').read_text(encoding='utf-8')
assert '</script' not in s, 'seed.json must not contain </script'
assert '/*SEED*/' in t, 'template placeholder missing'
(root / 'index.html').write_text(t.replace('/*SEED*/', s), encoding='utf-8')
print('built index.html', (root / 'index.html').stat().st_size, 'bytes')
