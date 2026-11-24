"""Resolve highest-sale player names from each official Moment page."""
import html
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


def serial_details(page):
    pairs = set(re.findall(r'serial #([0-9,]+) of ([0-9,]+)', html.unescape(page), re.I))
    if len(pairs) != 1:
        raise ValueError('Official Moment page must identify exactly one serial and edition size')
    serial, size = (int(v.replace(',', '')) for v in pairs.pop())
    if not 0 < serial <= size:
        raise ValueError('Invalid serial or edition size')
    return {'serialNumber': serial, 'editionSize': size}


def main():
    output = Path('public/data')
    data = build_dataset(output)
    path = output / 'player-names.json'
    names = json.loads(path.read_text()) if path.exists() else {}
    details_path = output / 'moment-details.json'
    details = json.loads(details_path.read_text()) if details_path.exists() else {}
    ids = {r.get('moments', {}).get('highestSale', {}).get('momentId') for r in data['days'] if r.get('moments', {}).get('highestSale')}
    for moment in sorted(ids):
        if moment in names and moment in details:
            continue
        if not re.fullmatch(r'\d+', moment):
            raise ValueError('Invalid Moment ID')
        try:
            page = subprocess.run(['curl', '-fsSL', '--retry', '3', '--max-time', '45', f'https://nbatopshot.com/moment/{moment}'], check=True, capture_output=True, text=True).stdout
            names[moment] = player_name(page)
            details[moment] = serial_details(page)
        except (subprocess.CalledProcessError, ValueError):
            if moment not in names:
                raise
            print(f'{moment}: serial unavailable; retaining verified player name', flush=True)
            continue
        atomic_json(path, names)
        atomic_json(details_path, details)
        print(f'{moment}: {names[moment]}', flush=True)
    build_dataset(output)


if __name__ == '__main__':
    main()
