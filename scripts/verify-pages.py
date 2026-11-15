"""Verify the deployed Pages snapshot without authentication."""
import json
import os
from pathlib import Path
import time
import urllib.request

expected = json.loads(Path('dist/data/daily.json').read_text())
origin = os.environ['PAGE_URL'].rstrip('/')
for attempt in range(12):
    try:
        request = urllib.request.Request(origin + '/data/daily.json?verify=' + str(time.time_ns()), headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response:
            actual = json.load(response)
        if actual == expected:
            print(f"Verified public Pages: {actual['completedDays']} complete days through {actual['throughDate']}")
            break
    except Exception as error:
        print(type(error).__name__)
    if attempt == 11:
        raise RuntimeError('Public Pages data differs from the deployed snapshot')
    time.sleep(10)
