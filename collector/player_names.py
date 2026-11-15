"""Resolve highest-sale player names from each official Moment page."""
import json
from pathlib import Path
import re
import subprocess
from collector.scan import atomic_json, build_dataset


def player_name(page):
    names = set(re.findall(r'FullName\\*"\s*:\s*\\*"([^"\\]+)', page))
    if len(names) != 1:
        raise ValueError('Official Moment page must identify exactly one player')
    return names.pop()


def main():
    output = Path('public/data')
    data = build_dataset(output)
    path = output / 'player-names.json'
    names = json.loads(path.read_text()) if path.exists() else {}
    ids = {r.get('moments', {}).get('highestSale', {}).get('momentId') for r in data['days'] if r.get('moments', {}).get('highestSale')}
    for moment in sorted(ids):
        if moment in names:
            continue
        if not re.fullmatch(r'\d+', moment):
            raise ValueError('Invalid Moment ID')
        page = subprocess.run(['curl', '-fsSL', '--retry', '3', '--max-time', '45', f'https://nbatopshot.com/moment/{moment}'], check=True, capture_output=True, text=True).stdout
        names[moment] = player_name(page)
        atomic_json(path, names)
        print(f'{moment}: {names[moment]}', flush=True)
    build_dataset(output)


if __name__ == '__main__':
    main()
