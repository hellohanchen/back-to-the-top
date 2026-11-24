import copy
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('challenge_storage', Path(__file__).parents[1] / 'scripts/challenge-storage.py')
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


class StorageTests(unittest.TestCase):
    def config(self, count=5):
        return {'slots': [{'id': str(i), 'dates': [f'2026-11-{23+i}'], 'metric': 'PTS'} for i in range(count)]}

    def validate(self, data, config):
        return storage.validate_snapshot(json.dumps(data).encode(), config)

    def test_five_and_six_slot_weeks_publish(self):
        for count in (5, 6):
            config = self.config(count)
            data = {'schemaVersion': 1, 'slots': config['slots']}
            self.assertEqual(self.validate(data, config), data)

    def test_missing_duplicate_and_outdated_slots_rejected(self):
        config = self.config()
        for field, value in [('id', 'wrong'), ('dates', ['2026-11-16']), ('metric', 'AR')]:
            data = {'schemaVersion': 1, 'slots': copy.deepcopy(config['slots'])}
            data['slots'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.validate(data, config)
        for slots in (config['slots'][:-1], config['slots'][:-1] + [config['slots'][0]]):
            with self.assertRaises(ValueError):
                self.validate({'schemaVersion': 1, 'slots': slots}, config)

    def test_invalid_schema_empty_and_oversized_rejected(self):
        config = self.config()
        for data in ({'schemaVersion': 2, 'slots': config['slots']}, {'schemaVersion': 1, 'slots': config['slots'], 'extra': 'x' * 1_000_000}):
            with self.assertRaises(ValueError):
                self.validate(data, config)
        with self.assertRaises(ValueError):
            self.validate({'schemaVersion': 1, 'slots': []}, {'slots': []})
