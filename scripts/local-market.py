#!/usr/bin/python3
"""Local collection with persistent caches; GitHub only publishes validated data.

Run from a dedicated cron directory containing checkout/. Never use a development
checkout: interrupted uncommitted data is restored from origin on the next attempt.
"""
import datetime as dt
import fcntl
import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT / 'checkout'
REPO = 'hellohanchen/back-to-the-top'
EST = dt.timezone(dt.timedelta(hours=-5))
URLS = [
    'https://back-to-the-top.pages.dev/data/daily.json',
    'https://hellohanchen.github.io/back-to-the-top/data/daily.json',
    'https://back-to-the-top-han.han110656.chatgpt.site/data/daily.json',
]
log = logging.getLogger('market-cron')


def command(*args, timeout=60):
    result = subprocess.run(args, cwd=CHECKOUT, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        # Never log credential-bearing subprocess output.
        raise RuntimeError('Command failed: ' + args[0] + ' ' + args[1])
    return result.stdout


def target_date(now):
    return (now.astimezone(EST).date() - dt.timedelta(days=1)).isoformat()


def complete(data, target):
    return any(d.get('date') == target and d.get('status') == 'complete' and d.get('marketShare', {}).get('version') == 1 for d in data.get('days', []))


def ready_to_collect(now, state):
    previous = state.get('lastAttemptAt')
    return not previous or (now - dt.datetime.fromisoformat(previous)).total_seconds() >= 900


def save_state(state):
    temp = ROOT / 'state.tmp'
    temp.write_text(json.dumps(state))
    temp.replace(ROOT / 'state.json')


def mirrors_match(snapshot):
    for url in URLS:
        try:
            hosted = json.loads(command('/usr/bin/curl', '-fsS', '--max-time', '30', url, timeout=35))
            if hosted != snapshot:
                return False
        except (ValueError, RuntimeError, subprocess.TimeoutExpired):
            return False
    return True


def main():
    with (ROOT / 'trigger.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        now = dt.datetime.now(dt.timezone.utc)
        target = target_date(now)
        path = ROOT / 'state.json'
        state = json.loads(path.read_text()) if path.exists() else {}
        if state.get('publishedDate') == target:
            return
        if not ready_to_collect(now, state):
            return
        state['lastAttemptAt'] = now.isoformat()
        save_state(state)
        command('git', 'fetch', 'origin', 'main')
        # A failed push retains the validated local commit. Retry it before collecting.
        ahead = command('git', 'rev-list', '--count', 'origin/main..HEAD').strip()
        if ahead != '0':
            command('git', 'restore', 'public/data')
            try:
                command('git', 'rebase', 'origin/main')
            except RuntimeError:
                command('git', 'rebase', '--abort')
                raise
            command('git', 'push', 'origin', 'HEAD:main')
            command('git', 'fetch', 'origin', 'main')
        # Only this isolated checkout is disposable; .cache remains persistent.
        command('git', 'reset', '--hard', 'origin/main')
        snapshot = json.loads((CHECKOUT / 'public/data/daily.json').read_text())
        if not complete(snapshot, target):
            log.info('Collecting completed EST days through %s locally', target)
            command('/usr/bin/python3', 'collector/scan.py', '--workers', '16', '--latest-first', timeout=10800)
            command('/usr/bin/python3', '-m', 'collector.market_share', timeout=10800)
            command('/usr/bin/python3', '-m', 'collector.player_names', timeout=3600)
        command('/usr/bin/python3', '-m', 'collector.validate_snapshot', target)
        command('git', 'add', 'public/data')
        if command('git', 'diff', '--cached', '--name-only').strip():
            command('git', 'commit', '-m', 'data: collect and enrich completed EST days locally')
            command('git', 'push', 'origin', 'HEAD:main')
            log.info('Pushed validated local dataset through %s', target)
        snapshot = json.loads((CHECKOUT / 'public/data/daily.json').read_text())
        if mirrors_match(snapshot):
            save_state({'publishedDate': target})
            log.info('Verified %s on all three sites', target)
            return
        runs = json.loads(command('/usr/bin/gh', 'api', f'repos/{REPO}/actions/workflows/daily.yml/runs?per_page=10'))['workflow_runs']
        if any(r['status'] != 'completed' for r in runs):
            return
        if any((now - dt.datetime.fromisoformat(r['created_at'].replace('Z', '+00:00'))).total_seconds() < 900 for r in runs):
            return
        command('/usr/bin/gh', 'workflow', 'run', 'daily.yml', '--repo', REPO)
        log.info('Retried publication only for %s', target)


if __name__ == '__main__':
    log.setLevel(logging.INFO)
    handler = RotatingFileHandler(ROOT / 'trigger.log', maxBytes=1_000_000, backupCount=2)
    handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
    log.addHandler(handler)
    try:
        main()
    except Exception as error:
        log.error('Local market update failed (%s: %s); retry after cooldown', type(error).__name__, str(error) if isinstance(error, RuntimeError) else 'check local state')
        raise SystemExit(1)
