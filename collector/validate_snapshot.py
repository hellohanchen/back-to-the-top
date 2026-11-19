"""Offline checks before committing or publishing a fully enriched snapshot."""
import json
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
import sys


def validate(data, target=None):
    rows = data['days']
    if not rows:
        raise ValueError('Empty snapshot')
    expected = date.fromisoformat(data['startDate'])
    for row in rows:
        if row['date'] != str(expected) or row['status'] != 'complete':
            raise ValueError('Missing or incomplete day: ' + str(expected))
        expected += timedelta(days=1)
        market = row['marketShare']
        moments = row['moments']
        if market['version'] != 1 or market['sales'] != moments['sales'] or Decimal(str(market['volume'])) != Decimal(str(moments['volume'])):
            raise ValueError('Market share totals differ from daily totals')
        for dimension in ('sets', 'players'):
            groups = market[dimension]
            if sum(g['sales'] for g in groups) != market['sales'] or sum((Decimal(str(g['volume'])) for g in groups), Decimal(0)) != Decimal(str(market['volume'])):
                raise ValueError('Market share groups do not reconcile')
    if data['completedDays'] != len(rows) or data['totalDays'] != len(rows) or data['latestCompleteDate'] != rows[-1]['date'] or data['throughDate'] != rows[-1]['date']:
        raise ValueError('Snapshot coverage does not match its rows')
    if target and rows[-1]['date'] < target:
        raise ValueError('Target day not collected')


if __name__ == '__main__':
    validate(json.loads(Path('public/data/daily.json').read_text()), sys.argv[1] if len(sys.argv) > 1 else None)
    print('Committed snapshot is complete and reconciled')
