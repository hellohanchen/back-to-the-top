import json
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from collector.player_names import player_name
from collector.scan import build_dataset

class PlayerNameTests(unittest.TestCase):
    def test_official_plain_and_hydrated_unicode(self):
        self.assertEqual(player_name('{"FullName":"Luka Dončić"}'), 'Luka Dončić')
        self.assertEqual(player_name(r'{\"FullName\":\"Luka Dončić\"}'), 'Luka Dončić')
        self.assertEqual(player_name('{"FullName":"Sue Bird"}{"FullName":"Sue Bird"}'), 'Sue Bird')

    def test_missing_or_conflicting_metadata_rejected(self):
        for page in ['<html>Not found</html>', '{"FullName":"A"}{"FullName":"B"}']:
            with self.assertRaises(ValueError):
                player_name(page)

    def test_only_matching_sale_enriched_without_changing_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp);(output/'days').mkdir()
            row={'date':'2026-10-01','status':'complete','moments':{'highestSale':{'momentId':'42','price':123}}}
            original=json.dumps(row)
            (output/'days/2026-10-01.json').write_text(original)
            (output/'player-names.json').write_text(json.dumps({'42':'Sue Bird','99':'Other'}))
            result=build_dataset(output, datetime(2026,10,2,12,tzinfo=timezone.utc))
            self.assertEqual(result['days'][0]['moments']['highestSale'],{'momentId':'42','price':123,'playerName':'Sue Bird'})
            self.assertEqual((output/'days/2026-10-01.json').read_text(),original)
