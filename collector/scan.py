"""Resumable Flow event collector. A day is published only after every request succeeds."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import gzip
import hashlib
import json
import os
from pathlib import Path
import statistics
import time
import uuid
import urllib.parse
import urllib.request

API = 'https://rest-mainnet.onflow.org/v1'
EST = timezone(timedelta(hours=-5))
START = date(2026, 10, 1)
PREFIX = 'A.0b2a3299cc857e29.'
TYPES = {PREFIX+'TopShot.NFT': 'moments', PREFIX+'PackNFT.NFT': 'packs'}
USD = {'A.ead892083b3e2c6c.DapperUtilityCoin.Vault'}
SYSTEM = {'0xe1f2a091f7bb5245', '0xb6f2481eba4df97b', '0x05b67ba314000b2d', '0x573684c4e31631d7'}
EVENTS = {
 'listing': 'A.4eb8a10cb9f87357.NFTStorefrontV2.ListingCompleted',
 'offer': 'A.b8ea91944fd51c43.OffersV2.OfferCompleted',
 'legacy': 'A.c1e4f4f4c4257510.TopShotMarketV3.MomentPurchased',
 'listed': 'A.4eb8a10cb9f87357.NFTStorefrontV2.ListingAvailable',
 'offered': 'A.b8ea91944fd51c43.OffersV2.OfferAvailable',
 'moment_in': PREFIX+'TopShot.Deposit', 'moment_out': PREFIX+'TopShot.Withdraw',
 'pack_in': PREFIX+'PackNFT.Deposit', 'pack_out': PREFIX+'PackNFT.Withdraw',
 'legacy_listed': 'A.c1e4f4f4c4257510.TopShotMarketV3.MomentListed',
 'legacy_repriced': 'A.c1e4f4f4c4257510.TopShotMarketV3.MomentPriceChanged',
 'legacy_withdrawn': 'A.c1e4f4f4c4257510.TopShotMarketV3.MomentWithdrawn',
 'listing_destroyed': 'A.4eb8a10cb9f87357.NFTStorefrontV2.Listing.ResourceDestroyed',
 'moment_minted': PREFIX+'TopShot.MomentMinted',
 'moment_destroyed': PREFIX+'TopShot.NFT.ResourceDestroyed',
 'pack_minted': PREFIX+'PackNFT.Minted',
 'pack_destroyed': PREFIX+'PackNFT.NFT.ResourceDestroyed',
 'pack_reveal_requested': PREFIX+'PackNFT.RevealRequest',
 'pack_open_requested': PREFIX+'PackNFT.OpenRequest',
 'pack_revealed': PREFIX+'PackNFT.Revealed',
 'pack_opened': PREFIX+'PackNFT.Opened',
 'locked': PREFIX+'TopShotLocking.MomentLocked', 'unlocked': PREFIX+'TopShotLocking.MomentUnlocked',
}

def parse_time(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))

def day_bounds(day):
    start = datetime.combine(day, datetime.min.time(), EST).astimezone(timezone.utc)
    return start, start + timedelta(days=1)

def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(value, separators=(',', ':'))+'\n')
    tmp.replace(path)

def decode(value):
    if not isinstance(value, dict):
        return value
    kind, val = value.get('type'), value.get('value')
    if kind == 'Optional':
        return decode(val)
    if kind == 'Type':
        return val['staticType'].get('typeID', val['staticType'].get('kind'))
    if kind in ('Event', 'Struct', 'Resource'):
        return {f['name']: decode(f['value']) for f in val['fields']}
    if kind == 'Array':
        return [decode(v) for v in val]
    if kind == 'Dictionary':
        return {str(decode(v['key'])): decode(v['value']) for v in val}
    return val

class Flow:
    def __init__(self, cache, workers=16):
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.workers = workers
        self.timestamps = {}

    def get(self, path, cache=True):
        target = self.cache/(hashlib.sha256(path.encode()).hexdigest()+'.json.gz')
        if cache and target.exists():
            with gzip.open(target, 'rt') as f:
                return json.load(f)
        for attempt in range(7):
            try:
                request = urllib.request.Request(API+path, headers={'User-Agent': 'BackToTheTop/1.0'})
                with urllib.request.urlopen(request, timeout=45) as response:
                    result = json.load(response)
                if cache:
                    temp = target.with_suffix('.'+uuid.uuid4().hex+'.tmp')
                    with gzip.open(temp, 'wt') as f:
                        json.dump(result, f, separators=(',', ':'))
                    os.replace(temp, target)
                return result
            except Exception:
                if attempt == 6:
                    raise
                time.sleep(min(2**attempt, 30))

    def timestamp(self, height):
        if height not in self.timestamps:
            self.timestamps[height] = parse_time(self.get(f'/blocks?height={height}')[0]['header']['timestamp'])
        return self.timestamps[height]

    def height_at(self, target, high):
        low = max(0, high-30_000_000)
        if self.timestamp(low) > target or self.timestamp(high) < target:
            raise ValueError('Requested date outside available sealed block range')
        while low < high:
            mid = (low+high)//2
            if self.timestamp(mid) < target:
                low = mid+1
            else:
                high = mid
        return low

    def events(self, job):
        kind, low, high = job
        blocks = self.get('/events?'+urllib.parse.urlencode({'type': EVENTS[kind], 'start_height': low, 'end_height': high}))
        result = []
        for block in blocks:
            for event in block.get('events', []):
                data = decode(json.loads(base64.b64decode(event['payload'])))
                if kind in ('listing', 'offer', 'listed', 'offered', 'listing_destroyed') and data.get('nftType') not in TYPES:
                    continue
                result.append({'kind': kind, 'ts': block['block_timestamp'], 'tx': event['transaction_id'],
                               'index': int(event['event_index']), 'data': data})
        return result

    def scan(self, day, high):
        start, end = day_bounds(day)
        low = self.height_at(start, high)
        upper = self.height_at(end, high)-1
        jobs = [(kind, h, min(h+249, upper)) for kind in EVENTS for h in range(low, upper+1, 250)]
        events = []
        print(f'{day}: blocks {low}–{upper}, {len(jobs)} requests', flush=True)
        with ThreadPoolExecutor(self.workers) as pool:
            for result in pool.map(self.events, jobs):
                events.extend(result)
        events = [e for e in events if start <= parse_time(e['ts']) < end]
        txs = sorted({e['tx'] for e in events if needs_signer(e)})
        def authorizers(tx):
            data = self.get('/transactions/'+tx)
            return tx, ['0x'+a.removeprefix('0x') for a in data.get('authorizers', [])]
        with ThreadPoolExecutor(self.workers) as pool:
            auth = dict(pool.map(authorizers, txs))
        unresolved = [e for e in events if e['kind'] == 'offer' and e['data'].get('purchased') and e['data'].get('paymentVaultType') not in USD]
        def payment_events(tx):
            result = self.get('/transaction_results/'+tx)
            return tx, result.get('events', [])
        with ThreadPoolExecutor(self.workers) as pool:
            payments = dict(pool.map(payment_events, sorted({e['tx'] for e in unresolved})))
        for event in unresolved:
            event['data']['resolvedPaymentVaultType'] = resolve_offer_currency(event, payments[event['tx']])
        summary = aggregate(events, auth)
        summary.update(date=day.isoformat(), status='complete', startHeight=low, endHeight=upper,
                       collectedAt=datetime.now(timezone.utc).isoformat())
        return summary

def resolve_offer_currency(offer, transaction_events):
    boundary = max((int(e['event_index']) for e in transaction_events if e['type'] == EVENTS['offer'] and int(e['event_index']) < offer['index']), default=-1)
    types = set()
    for e in transaction_events:
        if e['type'] != 'A.f233dcee88fe0abe.FungibleToken.Withdrawn' or not boundary < int(e['event_index']) < offer['index']:
            continue
        f = decode(json.loads(base64.b64decode(e['payload'])))
        if f.get('from') and Decimal(f['amount']) == Decimal(offer['data']['offerAmount']):
            types.add(f['type'])
    return next(iter(types)) if len(types) == 1 else None


SIGNER_EVENTS = {'locked', 'unlocked', 'listing_destroyed', 'pack_reveal_requested',
                 'pack_open_requested', 'moment_destroyed', 'pack_destroyed'}

def needs_signer(event):
    return event['kind'] in SIGNER_EVENTS or (event['kind'] == 'listing' and not event['data'].get('purchased'))

def asset_for(event):
    kind = event['kind']
    if kind.startswith('pack_'):
        return 'packs'
    return TYPES.get(event['data'].get('nftType'), 'moments')

def aggregate(events, authorizers=None):
    authorizers = authorizers or {}
    unique = {(e['tx'], e['index']): e for e in events}
    events = sorted(unique.values(), key=lambda e: (e['ts'], e['tx'], e['index']))
    transfers = {}
    sets = {a: {r: set() for r in ('active', 'buyers', 'sellers', 'listers', 'offerers', 'lockSigners', 'activitySigners')} for a in ('moments', 'packs')}
    sales = {a: [] for a in sets}
    locked = unlocked = ambiguous_locks = ambiguous_activity = non_usd = unmatched = 0
    activity_counts = {a: {} for a in sets}
    def add(asset, role, addr):
        if addr and addr.lower() not in SYSTEM:
            addr = addr.lower()
            sets[asset][role].add(addr)
            sets[asset]['active'].add(addr)
    for event in events:
        k, f, a = event['kind'], event['data'], asset_for(event)
        activity_counts[a][k] = activity_counts[a].get(k, 0) + 1
        if needs_signer(event):
            auth = authorizers.get(event['tx'], [])
            if len(auth) == 1:
                add(a, 'activitySigners', auth[0])
            else:
                ambiguous_activity += 1
        if k.endswith(('_in', '_out')):
            role = 'to' if k.endswith('_in') else 'from'
            addr = f.get(role)
            add(a, 'active', addr)
            transfers.setdefault((event['tx'], a, str(f['id'])), []).append((event['index'], role, addr))
        elif k in ('legacy_listed', 'legacy_repriced', 'legacy', 'legacy_withdrawn'):
            add(a, 'listers' if k == 'legacy_listed' else 'active', f.get('seller') or f.get('owner'))
        elif k == 'listed':
            add(a, 'listers', f.get('storefrontAddress'))
        elif k in ('offered', 'offer'):
            add(a, 'offerers' if k == 'offered' else 'active', f.get('offerAddress'))
            add(a, 'active', f.get('acceptingAddress'))
        elif k in ('locked', 'unlocked'):
            locked += k == 'locked'
            unlocked += k == 'unlocked'
            auth = authorizers.get(event['tx'], [])
            if len(auth) == 1:
                add('moments', 'lockSigners', auth[0])
            else:
                ambiguous_locks += 1
    for event in events:
        k, f, a = event['kind'], event['data'], asset_for(event)
        if k not in ('listing', 'offer', 'legacy') or (k != 'legacy' and f.get('purchased') is not True):
            continue
        vault = f.get('resolvedPaymentVaultType') or f.get('salePaymentVaultType') or f.get('paymentVaultType')
        if k != 'legacy' and vault not in USD:
            non_usd += 1
            continue
        amount = f.get('salePrice') if k == 'listing' else f.get('offerAmount') if k == 'offer' else f.get('price')
        if amount is None:
            raise ValueError(f'Missing sale amount: {event["tx"]}')
        nft = f.get('nftID') or f.get('nftId') or f.get('id')
        if nft is None:
            raise ValueError(f'Missing NFT identity: {event["tx"]}')
        price = Decimal(amount)
        if price < 0:
            raise ValueError('Negative sale')
        sales[a].append({'source': k, 'price': price, 'momentId': str(nft), 'transactionId': event['tx']})
        if k == 'offer':
            buyer, seller = f.get('offerAddress'), f.get('acceptingAddress')
        else:
            moves = transfers.get((event['tx'], a, str(nft)), [])
            # Settlement emits before completion; bound to this sale's transfer sequence.
            before = [m for m in moves if m[0] < event['index']]
            incoming = [m for m in moves if m[0] > event['index'] and m[1] == 'to' and m[2]]
            outgoing = [m for m in before if m[1] == 'from' and m[2]]
            buyer = incoming[0][2] if incoming else None
            seller = outgoing[-1][2] if outgoing else None
        add(a, 'buyers', buyer)
        add(a, 'sellers', seller)
        unmatched += not buyer or not seller
    def money(v):
        return float(v.quantize(Decimal('0.01')))
    def price_stats(prices):
        volume = sum(prices, Decimal(0))
        return {'sales': len(prices), 'volume': money(volume),
                'median': money(statistics.median(prices)) if prices else 0,
                'average': money(volume/len(prices)) if prices else 0,
                'highest': money(max(prices)) if prices else 0}
    result = {}
    for a in sets:
        prices = [s['price'] for s in sales[a]]
        volume = sum(prices, Decimal(0))
        result[a] = {
            'volume': money(volume), 'sales': len(prices),
            'median': money(statistics.median(prices)) if prices else 0,
            'average': money(volume/len(prices)) if prices else 0,
            'highest': money(max(prices)) if prices else 0,
            'highestSale': ({**{k: v for k, v in max(sales[a], key=lambda r: r['price']).items() if k != 'price'}, 'price': money(max(prices))} if sales[a] else None),
            **{k: len(v) for k, v in sets[a].items()},
            'activityEvents': activity_counts[a],
            'sources': {s: price_stats([r['price'] for r in sales[a] if r['source'] == s])
                        for s in ('listing', 'offer', 'legacy')},
        }
    result.update(locked=locked, unlocked=unlocked,
                  activityScope='monitored-topshot-events-v2',
                  quality={'unresolvedActivityEvents': ambiguous_activity, 'unresolvedLockEvents': ambiguous_locks, 'nonUsdSalesExcluded': non_usd, 'salesWithoutBothAddresses': unmatched},
                  **{role: len(sets['moments'][role] | sets['packs'][role]) for role in ('active', 'buyers', 'sellers')})
    return result

def build_dataset(output, now=None):
    now = now or datetime.now(timezone.utc)
    yesterday = now.astimezone(EST).date()-timedelta(days=1)
    rows = []
    day = START
    while day <= yesterday:
        path = output/'days'/f'{day}.json'
        rows.append(json.loads(path.read_text()) if path.exists() else {'date': str(day), 'status': 'pending'})
        day += timedelta(days=1)
    archive = output/'top-sales.json'
    historical = json.loads(archive.read_text()) if archive.exists() else {}
    for row in rows:
        if row.get('status') == 'complete' and 'highestSale' not in row['moments'] and row['date'] in historical:
            row['moments']['highestSale'] = historical[row['date']]
    complete = [r for r in rows if r['status'] == 'complete']
    payload = {'schemaVersion': 1, 'title': 'Back to the Top', 'timezone': 'EST (UTC−05:00)',
               'startDate': str(START), 'throughDate': str(yesterday), 'generatedAt': now.isoformat(),
               'completedDays': len(complete), 'totalDays': len(rows),
               'latestCompleteDate': complete[-1]['date'] if complete else None,
               'activityCoverage': {
                   'version': 'monitored-topshot-events-v2',
                   'completedDays': sum(r.get('activityScope') == 'monitored-topshot-events-v2' for r in complete),
                   'events': EVENTS,
                   'excludedAddresses': sorted(SYSTEM),
                   'attribution': 'Unique observed transfer endpoints, marketplace participant addresses, and single transaction authorizers for locks, listing removal/cleanup, NFT destruction and pack reveal/open requests. Authorizers are signers, not proven owners; transactions with zero or multiple authorizers remain unattributed unless other events identify participants.',
                   'limitations': [
                       'Covers the listed TopShot, PackNFT, TopShotLocking, NFTStorefrontV2, OffersV2 and legacy TopShotMarketV3 events; it is not an exhaustive audit of every TopShot-related contract or every on-chain action.',
                       'Transfers include gifts, mint deliveries and withdrawals; a gift cannot be distinguished reliably from an off-platform paid transfer.',
                       'Mint, reveal and open completion events without participant addresses do not independently identify users; administrative signers are not inferred as collectors.',
                       'Listing removal may be public cleanup of an expired or ghost listing; its signer is not necessarily the seller.',
                       'Metadata/series/set administration, contract/account setup, permission changes, calls without monitored events, and off-chain activity are excluded.',
                       'Only the listed known system addresses are excluded; addresses are not unique people and undiscovered service addresses may remain.',
                   ],
               }, 'days': rows}
    atomic_json(output/'daily.json', payload)
    return payload

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', type=date.fromisoformat, default=START)
    parser.add_argument('--end', type=date.fromisoformat)
    parser.add_argument('--workers', type=int, default=16)
    parser.add_argument('--day-workers', type=int, default=1)
    parser.add_argument('--cache', default='.cache/flow')
    parser.add_argument('--output', type=Path, default=Path('public/data'))
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--latest-first', action='store_true')
    parser.add_argument('--build-only', action='store_true')
    args = parser.parse_args()
    if args.build_only:
        build_dataset(args.output)
        return
    yesterday = datetime.now(EST).date()-timedelta(days=1)
    end = args.end or yesterday
    if args.start < START or end > yesterday or end < args.start:
        parser.error('Range must contain completed EST days on or after 2026-10-01')
    flow = Flow(args.cache, args.workers)
    high = int(flow.get('/blocks?height=sealed', cache=False)[0]['header']['height'])
    dates = [args.start+timedelta(days=i) for i in range((end-args.start).days+1)]
    if args.latest_first:
        dates.reverse()
    pending = [day for day in dates if args.refresh or not (args.output/'days'/f'{day}.json').exists()]
    with ThreadPoolExecutor(max(1, args.day_workers)) as pool:
        futures = {pool.submit(flow.scan, day, high): day for day in pending}
        for future in as_completed(futures):
            day = futures[future]
            summary = future.result()
            atomic_json(args.output/'days'/f'{day}.json', summary)
            print(f'{day}: moments ${summary["moments"]["volume"]:,.2f}, packs ${summary["packs"]["volume"]:,.2f}', flush=True)
            build_dataset(args.output)
    build_dataset(args.output)

if __name__ == '__main__':
    main()
