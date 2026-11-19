import unittest
from collector.market_share import summarize, compact_metadata, sale_rows

class Shares(unittest.TestCase):
    def test_reconciles_channels_ties_unknown_and_same_set_name(self):
        rows=[{'momentId':'1','price':'0.10','source':'offer'},{'momentId':'2','price':'0.20','source':'listing'},{'momentId':'3','price':'0.20','source':'listing'}]
        expected={'volume':.5,'sales':3,'sources':{'offer':{'volume':.1,'sales':1},'listing':{'volume':.4,'sales':2},'legacy':{'volume':0,'sales':0}}}
        meta={'1':{'setId':'1','setName':'Base','playerId':'A','playerName':'A'},'2':{'setId':'2','setName':'Base','playerId':'A','playerName':'A'}}
        result=summarize(rows,meta,expected)
        self.assertEqual(result['quality'],{'unattributedSetSales':1,'unattributedPlayerSales':1})
        self.assertEqual(len(result['sets']),3)
        self.assertEqual(result['players'][0]['volume'],.3)
        self.assertAlmostEqual(sum(r['volume'] for r in result['sets']),.5)
        expected['sources']['offer']['volume']=.2
        with self.assertRaises(ValueError):summarize(rows,meta,expected)
    def test_zero_and_missing_metadata(self):
        expected={'volume':0,'sales':0,'sources':{k:{'volume':0,'sales':0} for k in ('offer','listing','legacy')}}
        self.assertEqual(summarize([],{},expected)['sets'],[])
        self.assertEqual(compact_metadata({})['setId'],'')
    def test_metadata_groups_series_separately_and_preserves_names(self):
        result=compact_metadata({'edition':{'seriesId':'9','set':{'id':'285','name':'Base'},'editionTemplate':{'metadata':{'FullName':'Luka Dončić','PlayerId':'1'}}}})
        self.assertEqual(result['playerId'],'Luka Dončić')
        self.assertEqual(result['seriesName'],'Series 9')
    def test_missing_sales_fail_before_publish(self):
        with self.assertRaises(ValueError):summarize([],{}, {'volume':1,'sales':1})
    def test_verified_aliases_and_diacritics_merge(self):
        import tempfile
        import json
        from pathlib import Path
        from unittest.mock import patch
        from types import SimpleNamespace
        from collector.market_share import canonical_players
        players={'players':[{'playerName':'Stephen Curry','playerId':'201939'},{'playerName':'Nikola Jokić','playerId':'203999'}]}
        alias={'player':{'player':{'playerName':'Steph Curry','playerId':'201939'}}}
        with tempfile.TemporaryDirectory() as folder, patch('collector.market_share.SEED',Path(folder)), patch('collector.market_share.subprocess.run', side_effect=[SimpleNamespace(stdout=json.dumps(players)),SimpleNamespace(stdout=json.dumps(alias))]):
            result=canonical_players({'a':{'playerName':'Steph Curry'},'b':{'playerName':'Stephen Curry'},'c':{'playerName':'Nikola Jokic'}},Path(folder))
        self.assertEqual(result['a']['playerId'],result['b']['playerId'])
        self.assertEqual(result['c']['playerName'],'Nikola Jokić')

    def test_identity_seed_survives_missing_or_partial_runner_cache(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from collector.market_share import seed_and_cache
        with tempfile.TemporaryDirectory() as folder:
            seed, cache = Path(folder)/'seed', Path(folder)/'cache'
            seed.mkdir(); cache.mkdir()
            (seed/'chain-identities.json').write_text(json.dumps({'1':[12,34], '2':[56,78]}))
            with patch('collector.market_share.SEED', seed):
                self.assertEqual(seed_and_cache(cache, 'chain-identities.json'), {'1':[12,34], '2':[56,78]})
                (cache/'chain-identities.json').write_text(json.dumps({'2':[56,79], '3':[90,12]}))
                self.assertEqual(seed_and_cache(cache, 'chain-identities.json'), {'1':[12,34], '2':[56,79], '3':[90,12]})
                self.assertEqual(seed_and_cache(cache, 'pairs.json'), {})

    def test_seeded_moment_needs_no_metadata_request_on_clean_runner(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from collector.market_share import main
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); seed=root/'seed'; seed.mkdir()
            output=root/'output'; (output/'days').mkdir(parents=True)
            sales=root/'sales'; sales.mkdir()
            (seed/'moments.json').write_text(json.dumps({'sets':{'4':['Base','S1']},'moments':{'1':['4','A']}}))
            (seed/'player-aliases.json').write_text(json.dumps({'A':'A'}))
            (seed/'series.json').write_text('{}')
            date='2026-11-17'
            expected={'volume':1,'sales':1,'sources':{k:{'volume':int(k=='listing'),'sales':int(k=='listing')} for k in ('offer','listing','legacy')}}
            (output/'days'/f'{date}.json').write_text(json.dumps({'date':date,'status':'complete','moments':expected}))
            (sales/f'{date}.json').write_text(json.dumps([{'momentId':'1','price':'1','source':'listing'}]))
            with patch('collector.market_share.SEED',seed), patch('sys.argv',['market_share','--output',str(output),'--cache',str(root/'cache'),'--sales-dir',str(sales)]), patch('collector.market_share.subprocess.run',side_effect=AssertionError('Unexpected network request')), patch('collector.market_share.build_dataset'):
                main()
            actual=json.loads((output/'days'/f'{date}.json').read_text())['marketShare']
            self.assertEqual(actual['sets'][0]['volume'],1)
            self.assertEqual(actual['quality']['unattributedSetSales'],0)
