import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from collector.validate_snapshot import validate

spec = importlib.util.spec_from_file_location('local_market', Path(__file__).parents[1] / 'scripts/local-market.py')
cron = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cron)


def snapshot():
    row = json.loads(Path('public/data/days/2026-11-18.json').read_text())
    return {'days': [row], 'startDate': row['date'], 'throughDate': row['date'],
            'latestCompleteDate': row['date'], 'completedDays': 1, 'totalDays': 1}


class ValidationTests(unittest.TestCase):
    def test_valid_snapshot_and_missing_day(self):
        data = snapshot()
        validate(data, '2026-11-18')
        with self.assertRaises(ValueError):
            validate(data, '2026-11-19')
        data['days'][0]['status'] = 'pending'
        with self.assertRaises(ValueError):
            validate(data)

    def test_groups_must_reconcile(self):
        data = snapshot()
        data['days'][0]['marketShare']['players'][0]['volume'] += 1
        with self.assertRaises(ValueError):
            validate(data)


class CronTests(unittest.TestCase):
    def test_day_boundary_and_retry_cooldown(self):
        now = dt.datetime(2026, 11, 19, 4, 59, tzinfo=dt.timezone.utc)
        self.assertEqual(cron.target_date(now), '2026-11-17')
        self.assertEqual(cron.target_date(now + dt.timedelta(minutes=1)), '2026-11-18')
        self.assertFalse(cron.ready_to_collect(now, {'lastAttemptAt': now.isoformat()}))
        self.assertTrue(cron.ready_to_collect(now + dt.timedelta(minutes=15), {'lastAttemptAt': now.isoformat()}))

    def run_cron(self, target, fail_collect=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            checkout = root / 'checkout'
            (checkout / 'public/data').mkdir(parents=True)
            (checkout / 'public/data/daily.json').write_text(json.dumps(snapshot()))
            calls = []
            def command(*args, **kwargs):
                calls.append(args)
                if args[:2] == ('git', 'rev-list'):
                    return '0'
                if args[1:2] == ('collector/scan.py',) and fail_collect:
                    raise RuntimeError('offline')
                if args[:2] == ('/usr/bin/gh', 'api'):
                    return '{"workflow_runs": []}'
                return ''
            with patch.object(cron, 'ROOT', root), patch.object(cron, 'CHECKOUT', checkout), patch.object(cron, 'target_date', return_value=target), patch.object(cron, 'command', side_effect=command), patch.object(cron, 'mirrors_match', return_value=False):
                if fail_collect:
                    with self.assertRaises(RuntimeError):
                        cron.main()
                else:
                    cron.main()
            return calls, json.loads((root / 'state.json').read_text())

    def test_publish_retry_never_collects(self):
        calls, state = self.run_cron('2026-11-18')
        self.assertFalse(any('collector/scan.py' in c or 'collector.market_share' in c for c in calls))
        self.assertTrue(any(c[:3] == ('/usr/bin/gh', 'workflow', 'run') for c in calls))
        self.assertNotIn('publishedDate', state)

    def test_offline_collection_never_commits_or_publishes(self):
        calls, state = self.run_cron('2026-11-19', fail_collect=True)
        self.assertFalse(any(c[:2] in [('git', 'commit'), ('git', 'push'), ('/usr/bin/gh', 'workflow')] for c in calls))
        self.assertNotIn('publishedDate', state)
