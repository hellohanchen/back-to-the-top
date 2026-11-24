import json
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from collector.player_names import player_name, serial_details
from collector.scan import build_dataset

class PlayerNameTests(unittest.TestCase):
    def test_serial_from_official_description(self):
        self.assertEqual(serial_details('COMMON tier, serial #77 of 99.'), {'serialNumber':77, 'editionSize':99})
        self.assertEqual(serial_details('serial #12,345 of 40,000'), {'serialNumber':12345, 'editionSize':40000})
        for page in ('no metadata', 'serial #100 of 99', 'serial #0 of 99', 'serial #1 of 99 serial #2 of 99'):
            with self.assertRaises(ValueError):serial_details(page)


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
            (output/'moment-details.json').write_text(json.dumps({'42':{'serialNumber':7,'editionSize':99}}))
            result=build_dataset(output, datetime(2026,10,2,12,tzinfo=timezone.utc))
            self.assertEqual(result['days'][0]['moments']['highestSale'],{'momentId':'42','price':123,'playerName':'Sue Bird','serialNumber':7,'editionSize':99})
            self.assertEqual((output/'days/2026-10-01.json').read_text(),original)
