import base64
from datetime import date, datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from collector.scan import aggregate, day_bounds, decode, build_dataset, Flow, TYPES, USD, resolve_offer_currency

MOMENT = next(k for k,v in TYPES.items() if v == 'moments')
PACK = next(k for k,v in TYPES.items() if v == 'packs')
VAULT = next(iter(USD))
def event(kind, index, data, tx='tx'):
    return {'kind':kind, 'index':index, 'tx':tx, 'ts':'2026-10-01T10:00:00Z','data':data}
def sale(index=2, nft='7', price='1.00', asset=MOMENT, tx='tx'):
    return event('listing',index,{'nftType':asset,'purchased':True,'nftID':nft,'salePrice':price,'salePaymentVaultType':VAULT},tx)

class CollectorTests(unittest.TestCase):
    def test_fixed_est_through_dst(self):
        for d in (date(2026,10,1),date(2026,11,1),date(2026,11,2)):
            a,b=day_bounds(d)
            self.assertEqual(a.hour,5)
            self.assertEqual((b-a).total_seconds(),86400)

    def test_nested_optional_type(self):
        self.assertEqual(decode({'type':'Optional','value':{'type':'UInt64','value':'42'}}),'42')
        self.assertIsNone(decode({'type':'Optional','value':None}))
        self.assertEqual(decode({'type':'Type','value':{'staticType':{'kind':'Capability'}}}),'Capability')

    def test_dedup_preserves_two_sales_of_same_nft(self):
        first=sale();second=sale(9,price='2.00')
        result=aggregate([first,first,second])['moments']
        self.assertEqual(result['sales'],2)
        self.assertEqual(result['volume'],3)
        self.assertEqual(result['median'],1.5)

    def test_sale_address_matches_nft_and_after_completion(self):
        result=aggregate([event('moment_out',0,{'id':'7','from':'0xaa'}),sale(),event('moment_in',3,{'id':'7','to':'0xbb'}),event('moment_in',4,{'id':'99','to':'0xcc'})])
        self.assertEqual(result['moments']['buyers'],1)
        self.assertEqual(result['moments']['sellers'],1)
        self.assertEqual(result['quality']['salesWithoutBothAddresses'],0)
        self.assertEqual(result['active'],3)

    def test_asset_identity_and_union(self):
        events=[event('moment_out',0,{'id':'7','from':'0xaa'}),sale(),event('moment_in',3,{'id':'7','to':'0xbb'}),event('pack_out',4,{'id':'7','from':'0xaa'}),sale(5,asset=PACK),event('pack_in',6,{'id':'7','to':'0xbb'})]
        r=aggregate(events)
        self.assertEqual(r['buyers'],1)
        self.assertEqual(r['moments']['sales'],1)
        self.assertEqual(r['packs']['sales'],1)

    def test_cancel_and_unknown_currency_excluded(self):
        cancelled=sale();cancelled['data']['purchased']=False
        other=sale(3);other['data']['salePaymentVaultType']='FLOW'
        r=aggregate([cancelled,other])
        self.assertEqual(r['moments']['sales'],0)
        self.assertEqual(r['quality']['nonUsdSalesExcluded'],1)

    def test_offer_currency_and_direct_participants(self):
        r=aggregate([event('offer',1,{'nftType':MOMENT,'purchased':True,'nftId':'7','offerAmount':'123.45','paymentVaultType':'Capability','resolvedPaymentVaultType':VAULT,'offerAddress':'0xaa','acceptingAddress':'0xbb'})])
        self.assertEqual(r['moments']['volume'],123.45)
        self.assertEqual(r['buyers'],1)
        self.assertEqual(r['sellers'],1)

    def test_system_addresses_and_ambiguous_locks(self):
        r=aggregate([event('moment_in',0,{'id':'7','to':'0xe1f2a091f7bb5245'}),event('locked',1,{'id':'7'}),event('unlocked',2,{'id':'8'},'tx2')],{'tx':['0xaa','0xbb'],'tx2':['0xcc']})
        self.assertEqual(r['active'],1)
        self.assertEqual(r['locked'],1)
        self.assertEqual(r['unlocked'],1)
        self.assertEqual(r['quality']['unresolvedLockEvents'],1)

    def test_expanded_activity_includes_cancellation_legacy_and_requests(self):
        events = [event('listing', 0, {'nftType': MOMENT, 'purchased': False}),
                  event('legacy_repriced', 1, {'seller': '0xbb'}),
                  event('offer', 2, {'nftType': MOMENT, 'purchased': False, 'offerAddress': '0xcc'}),
                  event('pack_open_requested', 3, {'id': '7'}, 'pack'),
                  event('pack_reveal_requested', 4, {'id': '8'}, 'ambiguous')]
        r = aggregate(events, {'tx': ['0xaa'], 'pack': ['0xdd'], 'ambiguous': ['0xee', '0xff']})
        self.assertEqual(r['active'], 4)
        self.assertEqual(r['moments']['sales'], 0)
        self.assertEqual(r['packs']['activitySigners'], 1)
        self.assertEqual(r['quality']['unresolvedActivityEvents'], 1)
        self.assertEqual(r['moments']['activityEvents']['listing'], 1)

    def test_gift_addresses_and_lifecycle_not_sale_or_inferred_minter(self):
        r = aggregate([event('moment_out', 0, {'id': '7', 'from': '0xaa'}),
                       event('moment_in', 1, {'id': '7', 'to': '0xbb'}),
                       event('moment_minted', 2, {'momentID': '8'}),
                       event('pack_revealed', 3, {'id': '9'})], {'tx': ['0xcc']})
        self.assertEqual(r['active'], 2)
        self.assertEqual(r['moments']['sales'], 0)
        self.assertEqual(r['packs']['active'], 0)

    def test_listing_destroyed_not_double_sale_and_signer_dedup(self):
        r = aggregate([sale(), event('listing_destroyed', 3, {'nftType': MOMENT, 'purchased': True})], {'tx': ['0xaa']})
        self.assertEqual(r['moments']['sales'], 1)
        self.assertEqual(r['moments']['activitySigners'], 1)
        self.assertEqual(r['moments']['activityEvents']['listing_destroyed'], 1)

    def test_system_signers_excluded_and_cross_asset_signers_union(self):
        events = [event('pack_open_requested', 0, {'id': '7'}, 'system'),
                  event('moment_destroyed', 1, {'id': '8'}, 'user'),
                  event('pack_destroyed', 2, {'id': '9'}, 'user')]
        r = aggregate(events, {'system': ['0xe1f2a091f7bb5245'], 'user': ['0xAA']})
        self.assertEqual(r['active'], 1)
        self.assertEqual(r['moments']['active'], 1)
        self.assertEqual(r['packs']['active'], 1)
        self.assertEqual(r['quality']['unresolvedActivityEvents'], 0)

    def test_destroyed_listing_filters_other_collections(self):
        def encoded(nft):
            payload = {'type': 'Event', 'value': {'fields': [{'name': 'nftType', 'value': {'type': 'String', 'value': nft}}]}}
            return base64.b64encode(json.dumps(payload).encode()).decode()
        rows = [{'block_timestamp': '2026-10-01T10:00:00Z', 'events': [
                {'payload': encoded(MOMENT), 'transaction_id': 'tx', 'event_index': '0'},
                {'payload': encoded('A.other.Collection.NFT'), 'transaction_id': 'tx', 'event_index': '1'}]}]
        with tempfile.TemporaryDirectory() as d:
            f = Flow(d)
            with patch.object(f, 'get', return_value=rows):
                found = f.events(('listing_destroyed', 100, 200))
            self.assertEqual(len(found), 1)
            self.assertEqual(found[0]['data']['nftType'], MOMENT)

    def test_source_price_distribution_and_empty_source(self):
        events = [sale(i, price=str(v)) for i, v in enumerate([1, 2, 30])]
        events.append(event('offer', 5, {'nftType': MOMENT, 'purchased': True, 'nftId': '8',
                      'offerAmount': '80', 'paymentVaultType': VAULT, 'offerAddress': '0xaa', 'acceptingAddress': '0xbb'}))
        r = aggregate(events)['moments']['sources']
        self.assertEqual(r['listing'], {'sales': 3, 'volume': 33, 'median': 2, 'average': 11, 'highest': 30})
        self.assertEqual(r['offer']['median'], 80)
        self.assertEqual(r['legacy'], {'sales': 0, 'volume': 0, 'median': 0, 'average': 0, 'highest': 0})

    def test_pending_is_not_zero_and_current_day_excluded(self):
        with tempfile.TemporaryDirectory() as d:
            p=build_dataset(Path(d),datetime(2026,10,3,4,59,tzinfo=timezone.utc))
            self.assertEqual(len(p['days']),1)
            self.assertEqual(p['days'][0],{'date':'2026-10-01','status':'pending'})
            self.assertEqual(p['completedDays'],0)

    def test_network_failure_never_publishes_day(self):
        with tempfile.TemporaryDirectory() as d:
            f=Flow(d,2)
            with patch.object(f,'height_at',side_effect=[100,351]),patch.object(f,'events',side_effect=RuntimeError('network down')):
                with self.assertRaises(RuntimeError):f.scan(date(2026,10,1),400)

    def test_missing_amount_fails_closed(self):
        e=sale();del e['data']['salePrice']
        with self.assertRaises(ValueError):aggregate([e])

    def test_offer_currency_requires_amount_matched_withdrawal(self):
        payload={'type':'Event','value':{'fields':[{'name':'amount','value':{'type':'UFix64','value':'13.0'}},{'name':'from','value':{'type':'Address','value':'0xaa'}},{'name':'type','value':{'type':'Type','value':{'staticType':{'typeID':VAULT}}}}]}}
        txevent={'event_index':1,'type':'A.f233dcee88fe0abe.FungibleToken.Withdrawn','payload':base64.b64encode(json.dumps(payload).encode()).decode()}
        offer=event('offer',3,{'offerAmount':'13.00'})
        self.assertEqual(resolve_offer_currency(offer,[txevent]),VAULT)
        offer['data']['offerAmount']='14'
        self.assertIsNone(resolve_offer_currency(offer,[txevent]))

if __name__=='__main__':unittest.main()
