"""Read back every deployed JSON file from the public Cloudflare origin."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import time

root = Path('dist')
files = sorted(p for p in root.rglob('*.json') if p.name != '_routes.json') + [root / 'index.html', root / 'logo.png', root / 'favicon.ico', root / 'favicon.svg', root / 'challenge.html', root / 'challenge.js', root / 'challenge.css']


def verify(path):
    relative = path.relative_to(root).as_posix()
    route = '' if relative == 'index.html' else relative
    url = 'https://back-to-the-top.pages.dev/' + route
    for attempt in range(12):
        result = subprocess.run(
            ['curl', '--fail', '--silent', '--show-error', '--location',
             '--max-time', '30', url + '?verify=' + str(time.time_ns())],
            capture_output=True,
        )
        if result.returncode == 0 and result.stdout == path.read_bytes():
            return
        if attempt < 11:
            time.sleep(10)
    raise RuntimeError(f'Cloudflare public file does not match: {relative}')


with ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(verify, files))
print(f'Verified {len(files)} public Cloudflare files byte-for-byte')
