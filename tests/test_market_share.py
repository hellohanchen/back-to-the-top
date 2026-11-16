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
        with tempfile.TemporaryDirectory() as folder, patch('collector.market_share.subprocess.run', side_effect=[SimpleNamespace(stdout=json.dumps(players)),SimpleNamespace(stdout=json.dumps(alias))]):
            result=canonical_players({'a':{'playerName':'Steph Curry'},'b':{'playerName':'Stephen Curry'},'c':{'playerName':'Nikola Jokic'}},Path(folder))
        self.assertEqual(result['a']['playerId'],result['b']['playerId'])
        self.assertEqual(result['c']['playerName'],'Nikola Jokić')
